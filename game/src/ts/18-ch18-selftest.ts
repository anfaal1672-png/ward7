/* =========================================================================
   18. セルフテスト（?debug=1 でコンソール出力）
   ========================================================================= */
function runSelfTest(){
  var out = ([] as any[]), ok = true;
  function t(name: any, cond: any){ out.push((cond?'PASS':'FAIL')+' : '+name); if(!cond) ok = false; }

  // three.js を上げたときに光の計算が旧来へ戻せているか（第 1 章）
  t('three.js の光を旧来の計算へ戻せた', THREE_LEGACY_LIGHTS === true);
  t('色管理が切れている（SRGB() と二重に掛からない）', THREE.ColorManagement.enabled === false);

  var g = world.grid;
  t('grid 生成サイズ', g.length === GW*GH);
  // 外周は必ず壁
  var edgeOK = true;
  for(var x=0;x<GW;x++){ if(g[idx(x,0)]!==1 || g[idx(x,GH-1)]!==1) edgeOK=false; }
  for(var y=0;y<GH;y++){ if(g[idx(0,y)]!==1 || g[idx(GW-1,y)]!==1) edgeOK=false; }
  t('外周が閉じている', edgeOK);

  /* 斜め入力が速くなっていないか。len を向きの正規化に使ったあと速度倍率にも
     掛けていたため、キーボードの同時押しで √2 倍（8.14 m/s）出ていた。
     スティックでは出せない加速で、モバイル前提のゲームとして不公平だった。
     見た目に出ないぶん気づきにくいので、ここで押さえる。 */
  /* 音の左右。spatial() は右ベクトルとの内積を pan に入れるので、
     プレイヤーの右にある音源は pan>0、左は pan<0 になる。表示もそれに従う。 */
  (function(){
    var sy0 = player.yaw, sx0 = player.x, sz0 = player.z, svy = player.viewYaw;
    player.yaw = 0; player.viewYaw = 0;          // 正面 -Z、右ベクトルは +X
    var pr = spatial(player.x + 6, player.z, 30, false);
    var pl = spatial(player.x - 6, player.z, 30, false);
    player.yaw = sy0; player.viewYaw = svy; player.x = sx0; player.z = sz0;
    t('右の音は pan が正・左は負', pr.pan > 0.15 && pl.pan < -0.15);
    t('左右の表示が音と一致する', panDir(pr.pan) === '右' && panDir(pl.pan) === '左');
  })();

  /* 追跡者の声。ホルマントは低いほうから並んでいないと母音にならず、
     ただのバンドパスノイズになる。数字の打ち間違いは耳では気づけない
     （どれも「唸り」に聞こえてしまう）ので、ここで押さえる。 */
  (function(){
    var vs = Audio2.voxSpec(), specOK = true, distinct = ({} as Record<string, any>);
    vs.forEach(function(v){
      if(!(v.fm[0] < v.fm[1] && v.fm[1] < v.fm[2])) specOK = false;
      if(!(v.dur > 0 && v.amp > 0 && v.f0 > 0 && v.f1 > 0)) specOK = false;
      distinct[v.fm.join(',')] = 1;
    });
    var dn = 0; for(var dk in distinct) if(distinct.hasOwnProperty(dk)) dn++;
    t('追跡者の声が5種類ある', vs.length === 5);
    t('ホルマントが低い順に並んでいる', specOK);
    t('声ごとに母音が違う', dn === vs.length);
    // 遠すぎる声はノードを作らずに帰る。鳴らない距離で毎回組み立てると無駄
    var before = voxT; voxT = 0;
    t('声の呼び出しが例外を投げない', (function(){
      try{ Audio2.hunterVocal(2, 999, 0, true); return true; }catch(e){ return false; }
    })());
    voxT = before;
  })();

  t('斜め入力の速度倍率が 1 を超えない',
    Math.abs(moveScale(1,1) - 1) < 1e-9 && Math.abs(moveScale(1,0) - 1) < 1e-9 &&
    Math.abs(moveScale(0.5,0) - 0.5) < 1e-9);

  var sc = (buildInfo && buildInfo.start) ? buildInfo.start : {x:1, y:1};
  var field = bfsField(g, sc.x, sc.y);
  t('開始地点が通路', g[idx(sc.x, sc.y)] === 0);
  t('出口に到達可能', field[idx(world.exit.cell.x, world.exit.cell.y)] >= 0);

  var allReach = true;
  world.records.forEach(function(r: any){
    var c = worldToCell(r.x, r.z);
    if(field[idx(c.x,c.y)] < 0) allReach = false;
  });
  t('全カルテに到達可能', allReach);
  t('カルテ数が難易度どおり', world.records.length === DIFF[settings.diff].records);

  var batReach = true;
  world.batteries.forEach(function(b: any){
    var c = worldToCell(b.x, b.z);
    if(field[idx(c.x,c.y)] < 0) batReach = false;
  });
  t('全電池に到達可能', batReach);

  if(world.key){
    var kc = worldToCell(world.key.x, world.key.z);
    t('鍵に到達可能', field[idx(kc.x,kc.y)] >= 0);
  }
  t('施錠扉は出口セルを守っている',
    !world.lockDoor || (world.lockDoor.cell.x === world.exit.cell.x && world.lockDoor.cell.y === world.exit.cell.y));
  var hidesOK = true;
  world.hides.forEach(function(h: any){
    var hcell = worldToCell(h.exitX, h.exitZ);
    if(!inBounds(hcell.x,hcell.y) || field[idx(hcell.x,hcell.y)] < 0) hidesOK = false;
  });
  t('全ての隠れ場所に到達可能', hidesOK);
  t('隠れ場所が設置されている', world.hides.length >= 3);
  /* 頂点属性に NaN が無いこと。
     three r128 の normalizeNormals はゼロ長を守っておらず、蓋の頂点まわりで
     法線が NaN になる。NaN の法線は照明を NaN にし、iOS の WebGL では
     その部品ごと描かれない（実機で「頭と手と衣服と足だけ見える」と報告
     された症状の正体）。デスクトップでは何か描けてしまうので、絵を見て
     いるだけでは気づけない。数で押さえる。 */
  (function(){
    var bad = 0, meshes = 0;
    function scan(root: any){
      if(!root) return;
      root.traverse(function(o: any){
        if(!o.isMesh || !o.geometry) return;
        meshes++;
        var at = o.geometry.attributes;
        for(var k in at){
          var arr = at[k].array;
          for(var i=0;i<arr.length;i++) if(!isFinite(arr[i])){ bad++; break; }
        }
      });
    }
    /* 走査は追跡者・腕・壁だけにしていたが、法線が NaN になるのは
       computeVertexNormals を通る全ての形（什器・拾得物・扉・非常口・
       病衣・髪）で起こりうる。iOS では NaN の法線を持つ部品が丸ごと
       描かれないので、一箇所でも残っていれば実機で物が消える。
       シーン全体を見る。 */
    scan(scene); scan(viewScene);
    t('頂点属性に NaN が無い', meshes > 50 && bad === 0);
  })();

  // --- 区画表示板 ---
  var DIRS4 = [[1,0],[-1,0],[0,1],[0,-1]];   // EDIRS は buildWorld のローカルなのでここで持つ
  t('区画表示板が設置されている', world.zones.length >= 9);
  var zseen = ({} as Record<string, any>), zwall = true;
  world.zones.forEach(function(z: any){
    var zc = worldToCell(z.x, z.z);
    zseen[zoneOf(zc.x, zc.y)] = true;
    // 板は壁面に貼られているので、板の位置のマスは壁か、隣が壁のはず
    if(inBounds(zc.x, zc.y) && g[idx(zc.x,zc.y)] === 0){
      var anyWall = false;
      for(var zq=0; zq<4; zq++){
        var qx = zc.x + DIRS4[zq][0], qy = zc.y + DIRS4[zq][1];
        if(inBounds(qx,qy) && g[idx(qx,qy)] === 1) anyWall = true;
      }
      if(!anyWall) zwall = false;
    }
  });
  var zcount = 0; for(var zk in zseen) if(zseen.hasOwnProperty(zk)) zcount++;
  t('9区画すべてに表示板がある', zcount === 9);
  t('表示板が壁面に貼られている', zwall);
  // 誘導矢印は出口からのBFSを1マス下る向きを指すので、勾配をたどれば必ず出口に着く
  var exf = world.exitField, leadOK = true;
  if(exf){
    var cur = { x:world.exit.cell.x, y:world.exit.cell.y };
    world.zones.forEach(function(z: any){
      var zc2 = worldToCell(z.x, z.z);
      if(!inBounds(zc2.x, zc2.y)) return;
      var walk = { x:zc2.x, y:zc2.y }, guard = 0;
      if(g[idx(walk.x,walk.y)] !== 0) return;
      while(exf[idx(walk.x,walk.y)] > 0 && guard++ < 4000){
        var d0 = exf[idx(walk.x,walk.y)], moved = false;
        for(var wq=0; wq<4; wq++){
          var wx3 = walk.x + DIRS4[wq][0], wy3 = walk.y + DIRS4[wq][1];
          if(inBounds(wx3,wy3) && g[idx(wx3,wy3)] === 0 && exf[idx(wx3,wy3)] === d0-1){
            walk = { x:wx3, y:wy3 }; moved = true; break;
          }
        }
        if(!moved) break;
      }
      if(walk.x !== cur.x || walk.y !== cur.y) leadOK = false;
    });
  }
  t('誘導矢印をたどると非常口に着く', leadOK);
  t('誘導矢印は初期状態で消灯', world.zones.every(function(z: any){ return !z.arrow.visible; }) || world.exit.open);

  /* --- 壁と床の形 ---
     壁を InstancedMesh から結合ジオメトリに変えた。三角形を自前で
     並べる以上、巻き方向は自分で保証するしかない。実際ここは最初
     全 10976 枚が裏返っていて、背面カリングで壁が丸ごと消える状態
     だった。真っ暗なゲームなので目で見ても分からない。 */
  (function(){
    var wg = world.walls.geometry, pa = wg.attributes.position,
        na = wg.attributes.normal, ix = wg.index;
    var A0 = new THREE.Vector3(), B0 = new THREE.Vector3(), C0 = new THREE.Vector3();
    var E1 = new THREE.Vector3(), E2 = new THREE.Vector3(),
        CR = new THREE.Vector3(), NV = new THREE.Vector3();
    var flipped = 0;
    for(var i=0; i<ix.count; i+=3){
      A0.fromBufferAttribute(pa, ix.getX(i));
      B0.fromBufferAttribute(pa, ix.getX(i+1));
      C0.fromBufferAttribute(pa, ix.getX(i+2));
      E1.subVectors(B0, A0); E2.subVectors(C0, A0);
      CR.crossVectors(E1, E2).normalize();
      NV.fromBufferAttribute(na, ix.getX(i));
      if(CR.dot(NV) < 0.9) flipped++;
    }
    t('壁の面が開いている側を向いている', flipped === 0);
    // 隣も壁なら、その面は永久に見えない。畳むときに落としているはず
    var solidFaces = 0;
    for(var wy=0; wy<GH; wy++) for(var wx=0; wx<GW; wx++){
      if(g[idx(wx,wy)] !== 1) continue;
      var DD = [[1,0],[-1,0],[0,1],[0,-1]];
      for(var dq=0; dq<4; dq++){
        var qx2 = wx+DD[dq][0], qy2 = wy+DD[dq][1];
        if(inBounds(qx2,qy2) && g[idx(qx2,qy2)] === 0) solidFaces++;
      }
    }
    t('見えない壁面を畳んでいる', world.wallFaces === solidFaces);
    // 遮蔽は、開けた床が明るく壁の下が暗い、という向きで入っているか
    var cw = wg.attributes.color, lo = 1, hi = 0;
    for(var ci=0; ci<cw.count; ci++){ var cv = cw.getX(ci); if(cv<lo) lo=cv; if(cv>hi) hi=cv; }
    t('壁に遮蔽が焼けている', lo < 0.5 && hi > 0.9);
  })();

  /* --- 追跡者のモデル ---
     頂点色を遮蔽専用に使っている。material 側で vertexColors を立てた以上、
     色属性を持たないメッシュがひとつでも混ざると、そこだけ真っ黒に描かれる。
     暗い部屋なので目視では「影かな」で済んでしまい、気づけない。 */
  (function(){
    var noCol = 0, meshes = 0, aoMin = 1, aoMax = 0, aoN = 0, aoSum = 0, nan = 0;
    hunter.group.traverse(function(o: any){
      if(!o.isMesh) return;
      meshes++;
      var ca = o.geometry.attributes.color;
      if(o.material.vertexColors && !ca){ noCol++; return; }
      if(!ca) return;
      // 掃引の面（胴）は光線を飛ばさない別系統の陰りなので、この判定から外す
      if(o.userData && o.userData.loft) return;
      /* 体の汚れの階調も同じ頂点色に焼いてある。生の値を見ると
         「低品質では遮蔽を焼かない」が必ず落ちる。汚れを掛ける前に
         控えた範囲があるならそれを使う。 */
      var rec = o.userData && o.userData.ao;
      if(rec){
        if(!isFinite(rec.min) || !isFinite(rec.max)) nan++;
        if(rec.min < aoMin) aoMin = rec.min;
        if(rec.max > aoMax) aoMax = rec.max;
        aoSum += rec.sum; aoN += rec.n;
        return;
      }
      for(var i=0;i<ca.count;i++){
        var v = ca.getX(i);
        if(!isFinite(v)) nan++;
        if(v < aoMin) aoMin = v;
        if(v > aoMax) aoMax = v;
        aoSum += v; aoN++;
      }
    });
    /* 汚れの階調が実際に掛かっているか。掛ける前の平均を控えてあるので、
       いまの平均と比べれば掛かったかどうかが分かる。掛け忘れると
       体が一様な明るさに戻り、暗がりで石膏の人形に見える。 */
    (function(){
      var worstR = 9, seen = 0;
      hunter.group.traverse(function(o: any){
        if(!o.isMesh || !o.userData || !o.userData.ao) return;
        var ca2 = o.geometry.attributes.color, sm = 0;
        for(var i2=0;i2<ca2.count;i2++) sm += ca2.getX(i2);
        var r2 = (sm/ca2.count) / Math.max(o.userData.ao.sum/o.userData.ao.n, 1e-6);
        if(r2 < worstR) worstR = r2;
        seen++;
      });
      t('体に汚れの階調が焼けている（最小 ' + (seen ? worstR.toFixed(2) : '-') + '）',
        seen > 0 && worstR < 0.85);
    })();

    /* 皮膚のテクセル密度が部位で揃っているか。
       掃引は部位ごとに UV 0..1 で貼るのが既定で、そのままだと周長 1.2m の
       胴と 0.27m の腿で 4 倍違う。同じ皮膚のはずが、寄られたときに
       部位ごとに模様の大きさが変わって「別の材質を継いだ物」に見える。
       高さ方向の密度（UV の縦幅 ÷ 実寸の高さ）を部位間で比べる。 */
    (function(){
      var lo4 = 1e9, hi4 = 0, cnt4 = 0;
      hunter.group.traverse(function(o: any){
        if(!o.isMesh || !o.userData || !o.userData.loft) return;
        if((o.userData.procMat || o.material) !== hunter.parts.skin) return;   // skin は buildHunter の中の名前（人体の模型に替えた後は控えの材質）
        var ua = o.geometry.attributes.uv, pa4 = o.geometry.attributes.position;
        if(!ua || !pa4) return;
        var vmin = 1e9, vmax = -1e9, ymin = 1e9, ymax = -1e9;
        for(var i4=0; i4<ua.count; i4++){
          var vv4 = ua.array[i4*2+1];
          if(vv4 < vmin) vmin = vv4;
          if(vv4 > vmax) vmax = vv4;
          var yy4 = pa4.array[i4*3+1];
          if(yy4 < ymin) ymin = yy4;
          if(yy4 > ymax) ymax = yy4;
        }
        var hgt = ymax - ymin;
        if(hgt < 0.05) return;                 // 薄い部品は比が暴れる
        var den = (vmax - vmin) / hgt;
        if(den < lo4) lo4 = den;
        if(den > hi4) hi4 = den;
        cnt4++;
      });
      var sp4 = cnt4 ? hi4/Math.max(lo4,1e-6) : 1;
      t('皮膚のテクセル密度が部位で揃っている（' + sp4.toFixed(2) + '倍・' + cnt4 + '部位）',
        cnt4 >= 4 && sp4 < 1.6);
    })();
    t('頂点色を使う材質に色属性が揃っている', noCol === 0);
    t('追跡者のメッシュが揃っている', meshes >= 12);
    t('遮蔽の値が数値', nan === 0);
    // 焼く設定なら陰りが実際に出ていること。焼かない設定なら全て 1
    if(QC.hao) t('遮蔽が焼けている', aoMin < 0.75 && aoMax > 0.99 && aoSum/aoN > 0.6);
    else       t('低品質では遮蔽を焼かない', aoMin > 0.999);
  })();

  /* --- 突き出した頂点（棘）の検出 ---
     loftGeo の蓋の大きさはメートル指定なのに、割合のつもりで 0.7 を
     渡していた。髪の束の先から 70cm の棘が伸び、頭の上へ黒い線が
     何本も突き抜けていた。細いので正面からは気づかず、見上げて初めて
     分かる類の壊れ方なので、目で見る前に数で捕まえたい。

     外接箱で見ようとして一度失敗した。棘の先が本体の高さの範囲に
     収まっていると箱が膨らまず、通ってしまう（実際 1.24 で通った）。
     見るべきは辺の長さ。棘は必ず「まわりより桁違いに長い辺」を作る。
     実測：正常な追跡者で 2.4〜2.7 倍、棘を戻すと 10.3 倍。6 で切る。 */
  (function(){
    var worst = 0, worstN = '';
    hunter.group.traverse(function(o: any){
      if(!o.isMesh || o.isSkinnedMesh || !o.geometry.index || !o.geometry.attributes.position) return;
      var pa = o.geometry.attributes.position, ix = o.geometry.index;
      if(pa.count < 120) return;
      var arr = pa.array, ia = ix.array || ix, m = ia.length;
      var sum = 0, cnt = 0, mx = 0;
      for(var q4=0; q4<m; q4+=3){
        for(var e=0; e<3; e++){
          var v0 = ia[q4+e]*3, v1 = ia[q4+(e+1)%3]*3;
          var dx4 = arr[v0]-arr[v1], dy4 = arr[v0+1]-arr[v1+1], dz4 = arr[v0+2]-arr[v1+2];
          var L4 = Math.sqrt(dx4*dx4 + dy4*dy4 + dz4*dz4);
          sum += L4; cnt++; if(L4 > mx) mx = L4;
        }
      }
      var rr = mx / Math.max(sum/cnt, 1e-6);
      if(rr > worst){ worst = rr; worstN = mx.toFixed(2) + 'm/平均' + (sum/cnt).toFixed(3) + 'm'; }
    });
    t('追跡者に突き出した頂点が無い（最長辺 ' + worstN + ' = ' + worst.toFixed(1) + '倍）',
      worst < 6);
  })();

  /* --- 人体の模型（第 9.1 節） ---
     高精細以上で assets.js が届いていれば、手続きの体の代わりに模型が付いていること。
     骨は 40 本以内、いちばん細かい段で三角形 2 万以内。
     棘の検め：模型は腕を 2.5 倍に引き伸ばしてあるので、骨の向きの辺は元から長い（実測で平均の 10〜13 倍）。
     焼き損じの棘は体の外へ 1m 近く飛ぶので、長さそのもので見る（0.6m 未満） */
  (function(){
    if(!photoWanted() || !humanData()) return;
    var Hm = hunter.parts && hunter.parts.human;
    t('追跡者が人体の模型になっている', !!Hm);
    if(!Hm) return;
    var sk = Hm.meshes[0].skeleton;
    t('模型の骨が 40 本以内で、全部が追跡者の関節につながっている（' + sk.bones.length + ' 本）',
      sk.bones.length <= 40 && sk.bones.every(function(b: any){ return !!b && !!b.parent; }));
    t('模型のいちばん細かい段が 2 万三角形以内（' + (Hm.meshes[0].geometry.index.count/3) + '）',
      Hm.meshes[0].geometry.index.count/3 <= 20000);
    var worstE = 0;
    Hm.meshes.concat(Hm.gown).forEach(function(m: any){
      var a = m.geometry.attributes.position.array, ia = m.geometry.index.array;
      for(var q=0; q<ia.length; q+=3) for(var e=0; e<3; e++){
        var v0 = ia[q+e]*3, v1 = ia[q+(e+1)%3]*3;
        var L = Math.hypot(a[v0]-a[v1], a[v0+1]-a[v1+1], a[v0+2]-a[v1+2]); if(L > worstE) worstE = L;
      }
    });
    t('模型に突き出した頂点が無い（最長辺 ' + worstE.toFixed(2) + 'm）', worstE < 0.6);
    var nanW = 0;
    Hm.meshes.forEach(function(m: any){ var w = m.geometry.attributes.skinWeight.array;
      for(var i=0; i<w.length; i+=4) if(w[i] + w[i+1] + w[i+2] + w[i+3] < 250) nanW++; });
    t('模型の重みが頂点ごとに 1 に揃っている', nanW === 0);
  })();

  var hc = worldToCell(hunter.x, hunter.z);
  t('追跡者が通路上にいる', g[idx(hc.x,hc.y)] === 0);
  // 開始地点をランダム化した以上、目標を (1,1) 決め打ちにはできない。
  // さらに bfsNextStep は「同じマスにいる」と null を返すので、
  // 追跡者がたまたま目標マスに湧いた回で到達不能と誤判定していた。
  // 到達可能性そのものが見たいのだから BFS 距離で直接判定する。
  var pc = worldToCell(player.x, player.z);
  t('追跡者からプレイヤーへ経路がある', bfsField(g, pc.x, pc.y)[idx(hc.x,hc.y)] >= 0);

  // --- 什器による視線遮蔽 ---
  t('什器に高さが設定されている',
    world.props.every(function(op: any){ return typeof op.h === 'number' && op.h > 0; }));
  // 遮るのはロッカーだけ。隠れ場所のロッカー数と一致するはず
  var tall = world.props.filter(function(op: any){ return op.h > SIGHT_H; });
  var lockers = world.hides.filter(function(hd: any){ return hd.type === 'locker'; });
  t('視線を遮る什器はロッカーのみ', tall.length === lockers.length);
  // 壁を挟まない純粋な幾何として、什器の真上を通る線分で確かめる
  var tallBlocks = true, lowPasses = true;
  world.props.forEach(function(op: any){
    var blocked = propBlocksSight(op.x - 1.2, op.z, op.x + 1.2, op.z);
    if(op.h > SIGHT_H){ if(!blocked) tallBlocks = false; return; }
    // 低い什器でも、真横に高い什器があれば当然遮られる。その組は判定から外す
    var near = tall.some(function(tp: any){
      return Math.abs(tp.z - op.z) < tp.r && Math.abs(tp.x - op.x) < 1.2 + tp.r;
    });
    if(!near && blocked) lowPasses = false;
  });
  t('高い什器は視線を遮る', tallBlocks);
  t('低い什器は視線を通す', lowPasses);

  // --- 描画のバッチ結合と光源カリング ---
  t('静的什器を焼き固めている', !!world.bakeInfo && world.bakeInfo.baked > 0);
  // 変換行列を間違えると什器が別の場所へ飛ぶ。空になったグループの座標に
  // 焼いたジオメトリの頂点があるかを、いくつか抜き取って確かめる
  var bakedPts = ([] as any[]);
  world.group.children.forEach(function(o: any){
    if(!o.isMesh || o.isInstancedMesh || o.geometry.parameters) return;
    var pa = o.geometry.attributes.position;
    for(var vi=0; vi<pa.count; vi+=3) bakedPts.push(pa.getX(vi), pa.getZ(vi));
  });
  var placeOK = true, sampled = 0;
  world.group.children.forEach(function(o: any){
    if(sampled >= 4 || !o.isGroup || !o.userData.bake) return;
    sampled++;
    var near = 1e9;
    for(var q=0; q<bakedPts.length; q+=2){
      var dxp = bakedPts[q]-o.position.x, dzp = bakedPts[q+1]-o.position.z;
      var dq = dxp*dxp + dzp*dzp;
      if(dq < near) near = dq;
    }
    if(near > 1.6*1.6) placeOK = false;
  });
  t('焼き固めた什器が元の位置にある', sampled === 0 || placeOK);
  /* mergeMeshes は position・normal・uv しか運ばない。焼く対象の材質が
     頂点色を使っていると、焼いた瞬間に色属性が消えて真っ黒になる
     （追跡者の足で一度これをやった）。暗い場面では影と見分けが付かない。 */
  var bakedVC = 0;
  world.group.traverse(function(o: any){
    if(o.isMesh && o.material && o.material.vertexColors && !o.geometry.attributes.color) bakedVC++;
  });
  t('頂点色を使う什器を焼き固めていない', bakedVC === 0);
  // --- 腕（ビューモデル） ---
  if(viewParts && viewParts.skinGeo){
    var dl = viewParts.digitLens;
    // 指の長さは 中指 > 環指 > 示指 > 小指。人体の並びどおりか
    t('指の長さの順序が人体どおり',
      dl.length === 4 && dl[1] > dl[2] && dl[2] > dl[0] && dl[0] > dl[3]);
    // 握った手が胴に埋まると、指が金属に溶けたように見える
    var pa2 = viewParts.skinGeo.attributes.position, worstC = 9;
    for(var vi2=0; vi2<pa2.count; vi2++){
      var need2 = viewParts.barrelAt(pa2.getZ(vi2));
      if(need2 <= 0) continue;
      var cl2 = Math.sqrt(pa2.getX(vi2)*pa2.getX(vi2) + pa2.getY(vi2)*pa2.getY(vi2)) - need2;
      if(cl2 < worstC) worstC = cl2;
    }
    t('手がランプの胴に食い込んでいない', worstC > -0.0005);
    // 面が裏返ると背面カリングで腕ごと消える。符号付き体積で巻き方向を見る
    var ip2 = viewParts.skinGeo.index, vol2 = 0;
    var va2 = new THREE.Vector3(), vb2 = new THREE.Vector3(),
        vc2 = new THREE.Vector3(), vx2 = new THREE.Vector3();
    for(var ti2=0; ti2<ip2.count; ti2+=3){
      va2.fromBufferAttribute(pa2, ip2.getX(ti2));
      vb2.fromBufferAttribute(pa2, ip2.getX(ti2+1));
      vc2.fromBufferAttribute(pa2, ip2.getX(ti2+2));
      vol2 += vx2.crossVectors(va2, vb2).dot(vc2)/6;
    }
    t('腕の面が外を向いている', vol2 > 0);
    // 食い込みが 0 でも、離れて浮いていたら握りに見えない。
    // 中節から先は胴に触れているはず（自由な円弧で曲げると必ずここが浮く）
    var gripOK = true, gapMax = 0;
    viewParts.digitSt.forEach(function(dst: any){
      for(var si=4; si<dst.length-1; si++){
        var pw = dst[si].p;
        var gap = Math.sqrt(pw[0]*pw[0] + pw[1]*pw[1]) - viewParts.barrelAt(pw[2]) - dst[si].rx;
        if(gap > gapMax) gapMax = gap;
        if(gap > 0.0015) gripOK = false;
      }
    });
    t('指が胴を握っている（浮いていない）', gripOK);

    /* トーンマップを外した材質が混ざっていないか。
       腕は本編と別のシーンに描くので、ここに toneMapped:false が
       一つでもあると、その部品だけ ACES を素通りして白く飛ぶ。
       実際、爪・包帯・リストバンドの 3 つが外れていて、暗い廊下で
       指先と手首だけが紙のように光っていた。 */
    var rawTone = 0;
    viewScene.traverse(function(o: any){
      if(!o.isMesh || !o.material) return;
      var ml = Array.isArray(o.material) ? o.material : [o.material];
      for(var mi3=0; mi3<ml.length; mi3++)
        if(ml[mi3].isMeshStandardMaterial && ml[mi3].toneMapped === false) rawTone++;
    });
    t('腕にトーンマップを外した材質が無い', rawTone === 0);

    /* 反射率の上限。色とテクスチャは掛け算になるので、両方明るいと
       「白い紙より白い布」ができあがる。実際、包帯が線形 0.53 あって
       ランプを向けるたびに必ず白飛びしていた。
       実在の拡散反射材で最も明るいのは新雪の 0.8、白い塗料で 0.7。
       この場面に出るのは汚れた布・肌・ゴムだけ。実測で今いちばん
       明るい面が 0.313、飛んでいた包帯を戻すと 0.381。0.35 で切る
       （両側におよそ 1 割の余裕を取った位置）。 */
    var tooBright = (null as any);
    viewScene.traverse(function(o: any){
      if(tooBright || !o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
      var m3 = o.material;
      if(m3.metalness > 0.5) return;              // 金属は拡散反射が無いので別勘定
      // 発光する面（レンズ）は光源であって材質ではない。上限の対象外
      if(m3.emissive && (m3.emissive.r + m3.emissive.g + m3.emissive.b) > 0.01) return;
      var k = m3.map ? texMeanLinear(m3.map.image) : [1,1,1];
      var lin = 0.299*m3.color.r*k[0] + 0.587*m3.color.g*k[1] + 0.114*m3.color.b*k[2];
      if(lin > 0.35) tooBright = o.name + ' ' + lin.toFixed(3);
    });
    t('腕の反射率が実在の材質の範囲に収まっている' +
      (tooBright ? '（' + tooBright + '）' : ''), tooBright === null);
  }

  /* --- 自動露出（明順応） ---
     幾何から戻り光を見積もっているので、GPU を通さずに数で確かめられる。
     プレイヤーを動かして向きを変え、絞りが正しい向きに動くかを見る。
     終わったら元の位置と倍率へ必ず戻す（試験が状態を残すと、
     次の試行が別の明るさで始まってしまう）。 */
  (function(){
    var sx = player.x, sz = player.z, syaw = player.viewYaw,
        spit = player.pitch, sad = expAdapt;
    /* 足元の補助光。死亡演出でここを床へ降ろして「落ちたランプ」に
       流用している。戻し忘れると、遊び直したときもタイトルへ戻ったときも
       床だけが暖色で明るいまま残る。

       2 つ見る。遊んでいる間に既定の位置にあること（毎フレーム
       書き直しているので、その処理が消えたら落ちる）と、戻す関数が
       実際に戻すこと。呼び出し側が消えた場合はこれでは捕まらない
       ——診断中に toTitle を通すわけにはいかないので、そこは諦める。 */
    t('足元の補助光が既定の位置にある', playerLight.position.lengthSq() < 0.04);
    (function(){
      var sp = playerLight.position.clone(), si = playerLight.intensity;
      playerLight.position.set(0.20, -1.42, -0.74); playerLight.intensity = 2.0;
      resetPlayerLight();
      var okR = playerLight.position.lengthSq() < 1e-9 &&
                Math.abs(playerLight.intensity - PLIGHT_I) < 1e-9;
      playerLight.position.copy(sp); playerLight.intensity = si;
      t('補助光を既定へ戻せる', okR);
    })();

    /* 露出の見積もりが使う照射角と、実際の光の照射角が一致しているか。
       別々に書いていたので、ビームを絞ったあとも見積もりだけ 33 度の
       ままだった。円錐の外の物まで「照らしている」と数えてしまう。 */
    t('露出の見積もりと実際の照射角が一致している',
      Math.abs(flashlight.angle - LAMP_ANG) < 1e-9);
    /* 露出が「いまの品質」で書き直されているか。
       ここが抜けていたのが元のバグで、起動時の品質で計算した値が
       ずっと残り、最高品質の画が 25% 明るいまま描かれていた。
       設定画面を開かないと直らないので、遊んでいる側からは気づけない。 */
    t('露出がいまの品質で書き直されている',
      Math.abs(renderer.toneMappingExposure - exposureNow()) < 1e-6);
    // 目の前が壁になる向きと、いちばん遠くまで抜ける向きを探す
    var near = -1, far = -1, dn = 99, df = 0;
    for(var q3=0; q3<4; q3++){
      player.viewYaw = q3 * Math.PI/2; player.pitch = 0;
      var dd3 = beamHitDist();
      if(dd3 < dn){ dn = dd3; near = q3; }
      if(dd3 > df){ df = dd3; far = q3; }
    }
    t('ビームの当たる距離が向きで変わる', df - dn > 1.0);
    // 近い壁を向いたら絞る、遠くを向いたら開く
    player.viewYaw = near * Math.PI/2; expAdapt = 1;
    for(var s3=0; s3<40; s3++) updateExposure(0.05, 1);
    var kNear = expAdapt;
    player.viewYaw = far * Math.PI/2; expAdapt = 1;
    for(var s4=0; s4<40; s4++) updateExposure(0.05, 1);
    var kFar = expAdapt;
    t('近い壁を向くと絞る', kNear < kFar);
    // 消灯すると暗さに慣れて開く（上限まで）
    expAdapt = 1;
    for(var s5=0; s5<200; s5++) updateExposure(0.05, 0);
    t('消灯すると明順応で開く', expAdapt > 1.15);
    t('露出倍率が上下限に収まっている',
      kNear >= EXP_LO - 1e-6 && kFar <= EXP_HI + 1e-6 && expAdapt <= EXP_HI + 1e-6);
    /* 順応は「まぶしい方が速い」。同じ速さだと、壁から離れた瞬間に
       画面全体が持ち上がって不自然に見える。 */
    /* 速さは「同じ隔たりを 0.1 秒でどれだけ詰めたか」で比べる。
       到達値からの差を揃えないと、隔たりの大きさの違いを速さと
       取り違える（最初これで 1.52 倍と出て、差があるのに落ちた）。 */
    var GAP = 0.30;
    player.viewYaw = near * Math.PI/2; expAdapt = kNear + GAP;
    updateExposure(0.10, 1);
    var fDown = (kNear + GAP - expAdapt) / GAP;
    player.viewYaw = far * Math.PI/2; expAdapt = kFar - GAP;
    updateExposure(0.10, 1);
    var fUp = (expAdapt - (kFar - GAP)) / GAP;
    t('絞るほうが慣れるより速い', fDown / Math.max(fUp, 1e-6) > 2);
    player.x = sx; player.z = sz; player.viewYaw = syaw;
    player.pitch = spit; expAdapt = sad;
  })();

  // --- AI観戦モード ---
  // 既定では 1 行も走らないこと、走るなら記憶が確保されていることを見る
  t('AI観戦モードの状態が整合している',
    BOT.on ? !!(BOT.ready && BOT.known && BOT.known.length === GW*GH &&
                BOT.penalty && BOT.penalty.length === GW*GH)
           : (BOT.known === null || !BOT.ready));
  // 自分の足元は必ず見えている（知覚の入口が壊れていないか）
  t('AIの視覚判定が働いている', botCanSee(player.x, player.z) === true);

  /* スティックの効き。端で 1 に届かないと全力疾走が出せず、
     追跡者に必ず捕まる。曲線の性質を数で押さえる。 */
  t('スティック：置いただけでは動かない', stickCurve(0) === 0 && stickCurve(0.10) === 0);
  t('スティック：端で全開になる', Math.abs(stickCurve(1) - 1) < 1e-9);
  t('スティック：単調に増える', (function(){
      var prev = -1;
      for(var v=0; v<=1.0001; v+=0.05){ var y = stickCurve(v); if(y < prev) return false; prev = y; }
      return true;
    })());
  t('スティック：中央寄りが寝ている', stickCurve(0.5) < 0.5);

  /* カルテの出題順。同じ紙が二度出る、枚数が足りない、閉じの文が
     途中で出る、のどれもゲームの筋が壊れるが、遊んで気づくには周回が要る。 */
  (function(){
    var ord = world.noteOrder || [];
    var uniq = ({} as Record<string, any>), dup = false, range = true;
    for(var i=0;i<ord.length;i++){
      if(uniq[ord[i]]) dup = true;
      uniq[ord[i]] = 1;
      if(!(ord[i] >= 0 && ord[i] < NOTES.length)) range = false;
    }
    t('カルテの出題順が枚数ぶんある', ord.length === player.need);
    t('カルテが重複していない', !dup && range);
    t('閉じの文が最後に来る', ord.length > 0 && ord[ord.length-1] === NOTE_LAST);
  })();

  /* 埃はプレイヤーの周りの箱に留まり続けなければならない。
     置き去りにすると、歩いた先に空気が無くなる（そして戻ると溜まっている）。
     逆に箱ごと追従させると粒が体に張り付き、歩いても景色が流れない。
     どちらも「暗い画面でよく見ないと気づかない」種類の壊れ方なので、数で押さえる。 */
  if(dustPts){
    var px0 = player.x, pz0 = player.z;
    player.x += 40; player.z -= 25;                 // 遠くへ跳ばす
    for(var du=0; du<40; du++) updateDust(1/60);
    var da = dustPts.geometry.attributes.position.array, far = 0;
    for(var di=0; di<da.length; di+=3){
      var ex = Math.abs(da[di] - player.x), ez = Math.abs(da[di+2] - player.z);
      if(Math.max(ex, ez) > far) far = Math.max(ex, ez);
    }
    t('埃がプレイヤーの周りに留まる', far <= DUST_BOX + 0.5);
    t('埃が世界座標に置かれている（体に張り付いていない）',
      Math.abs(dustPts.position.x) < 1e-6 && Math.abs(dustPts.position.z) < 1e-6);
    player.x = px0; player.z = pz0;
    for(var du2=0; du2<40; du2++) updateDust(1/60);
  }

  /* 残響のインパルス応答。NaN や発散が混ざると音が丸ごと消えるが、
     静かなゲームなので耳では気づけない。数で押さえる。 */
  (function(){
    var sr = 48000, n = Audio2.makeIR.len(sr);
    var buf = new Float32Array(Math.min(n, 24000));
    Audio2.makeIR(buf, sr);
    var ok = true, peak = 0;
    for(var i=0;i<buf.length;i++){
      if(!isFinite(buf[i])) { ok = false; break; }
      if(Math.abs(buf[i]) > peak) peak = Math.abs(buf[i]);
    }
    t('残響IRが有限で発散していない', ok && peak > 0.0001 && peak < 4);
    // 前半より後半が静かであること（減衰しない＝残響ではない）
    var e1 = 0, e2 = 0, h = buf.length >> 1;
    for(var j=0;j<h;j++) e1 += buf[j]*buf[j];
    for(var j2=h;j2<buf.length;j2++) e2 += buf[j2]*buf[j2];
    t('残響IRが減衰している', e2 < e1 * 0.6);
    t('残響IRの頭が無音（立ち上がりの遅れ）', Math.abs(buf[0]) < 1e-4);
  })();

  /* 聴覚の前後。旧版は pan だけを見ていて真後ろの音を「前」と答えていた。
     作り直した botHear は世界角を保つので、背後の音は '後ろ' になること。
     方位の呼び名も左右を取り違えていないか同時に押さえる。 */
  (function(){
    var hx0 = hunter.x, hz0 = hunter.z, hy0 = player.yaw;
    var ev0 = BOT.ear.vol, ec0 = BOT.ear.conf, ew0 = BOT.ear.worldA, ee0 = BOT.ear.err;
    player.yaw = 0;                       // 正面は -z 方向
    BOT.ear.vol = 0.2; BOT.ear.conf = 0; BOT.ear.errT = 99; BOT.ear.err = 0;
    hunter.x = player.x; hunter.z = player.z + 8;      // 真後ろ
    botHear(0.016);
    t('聴覚が背後の音を背後と答える', dirName(botHearRel()) === '後ろ');
    BOT.ear.conf = 0;
    hunter.x = player.x + 8; hunter.z = player.z;      // 真右
    botHear(0.016);
    t('聴覚の左右が合っている', dirName(botHearRel()) === '右');
    hunter.x = hx0; hunter.z = hz0; player.yaw = hy0;
    BOT.ear.vol = ev0; BOT.ear.conf = ec0; BOT.ear.worldA = ew0;
    BOT.ear.err = ee0; BOT.ear.errT = 0;
  })();
  /* 足音の大きさから距離を戻せること。
     ここが狂うと、ボットは「相手はまだ遠い」と思ったまま詰められる。
     鳴らす側（Audio2 の stepAtten）と戻す側で式が食い違わないよう、
     鳴らす側と同じ減衰を作って往復させる。 */
  (function(){
    var att = function(d: any){ return (6/(6+d)) * (1 - Math.pow(clamp(d/40,0,1),3)); };
    var worst = 0, ok = true;
    [2, 5, 9, 14, 20, 26, 33].forEach(function(d){
      var e = botStepDist(att(d), true);                  // 見通せる足音
      worst = Math.max(worst, Math.abs(e - d));
      var m = botStepDist(att(d)*0.55, false);            // 壁越し（0.55 倍）
      worst = Math.max(worst, Math.abs(m - d));
      if(!isFinite(e) || !isFinite(m)) ok = false;
    });
    t('足音の大きさから距離を戻せる', ok && worst < 0.2);
    // 遠い音ほど小さい＝単調。ここが崩れると二分法が別の解に落ちる
    var mono = true, prev = -1;
    for(var d2 = 1; d2 < 39; d2 += 2){
      var v2 = botStepDist(att(d2), true);
      if(v2 <= prev) mono = false;
      prev = v2;
    }
    t('足音から測る距離が単調', mono);
  })();
  /* 追跡者の全ジョイントが有限値であること。
     腕の回転が NaN になって画面から腕が丸ごと消えていたのに、79 項目の
     どれにも引っかからなかった（var の巻き上げで undefined を掛けていた）。
     NaN の回転は行列を壊して枝ごと描画されなくなるので、絵を見ても
     「そこに無い」としか分からず、数値を狙って測るまで見つからない。
     姿勢を 1 度進めてから、位置・回転・拡大のすべてを見る。 */
  (function(){
    if(!hunter.parts || !hunter.group) return;
    var bad = [], seen = 0;
    hunter.group.traverse(function(o: any){
      seen++;
      var v = [o.position.x,o.position.y,o.position.z,
               o.rotation.x,o.rotation.y,o.rotation.z,
               o.scale.x,o.scale.y,o.scale.z];
      for(var i=0;i<v.length;i++) if(!isFinite(v[i])){ bad.push(o.name || ('#'+seen)); break; }
    });
    t('追跡者のジョイントが全て有限値（' + seen + ' 個）', bad.length === 0);
  })();

  // 消えているライトを visible のままにするとシェーダの負荷だけが残る
  var lightsOK = true;
  scene.traverse(function(o: any){
    if(o.isPointLight && o.intensity <= 0.001 && o.visible) lightsOK = false;
  });
  t('消灯中のポイントライトを無効化している', lightsOK);

  t('座標が数値', isFinite(player.x) && isFinite(player.z) && isFinite(hunter.x) && isFinite(hunter.z));
  t('worldToCell の往復', (function(){
      var w = cellToWorld(5,7), c = worldToCell(w.x, w.z);
      return c.x===5 && c.y===7;
    })());
  t('ライトプール数が上限内', lightPool.length === 4);

  console.log('%c[WARD7 self-test] ' + (ok?'ALL PASS':'FAILURE'), 'color:'+(ok?'#6fbfa8':'#ff5a5a'));
  out.forEach(function(l){ console.log('  '+l); });
  window.__WARD7_TEST__ = { ok:ok, lines:out };
  return ok;
}
window.__ward7SelfTest = runSelfTest;


/* =========================================================================
   9. 追跡者
   ========================================================================= */
var hunter = {
  group:null, root:null, head:null, armL:null, armR:null, legL:null, legR:null, shadow:null,
  x:0, z:0, yaw:0, cell:{x:1,y:1}, target:null, path:null,
  mode:'patrol', repathT:0, patrolT:0, lastSeen:null, speed:1.9, attackCd:0, bob:0, spawnGrace:0,
  memT:0, chaseT:0, twitchT:0, twitch:0, stepAcc:0, jawOpen:0, reach:0, gaitRun:0, turnLead:0, walkK:0, bank:0, yawRate:0, yawPrev:undefined, parts:null,
  glitchT:0, glitch:0, eyeT:0, eyeOff:0, stunT:0, windT:0, swingT:0,
  stuckT:0, slideDir:0, noDirectT:0, punchArm:1,
  gazeT:0, gazeY:0, gazeTarget:0,
  dirX:0, dirZ:0, cornerK:0, inspect:null, inspectT:0,
  vent:null, ventT:0, ventCd:0
};

/* 演出の頭脳（設計指示書 第 5.3 節）。
   追跡者自身は見たもの・聞いたものしか使わない。その上に、緊張の波だけを
   整える層を置く。長く何も起きなければ徘徊の行き先をこちらの近くへ寄せ、
   追跡を振り切った直後は遠くへ散らして一息つかせる。
   こちらの正確な位置は渡さない（行き先の候補を絞るだけ）。 */
var DIRECTOR = { calmT:0, sinceChaseT:999 };
/* 寄せるときの行き先：こちらのマスから（マンハッタン距離）。
   5〜12 で寄せ直しを calm の半分ごとにしていたら、通常のクリアが 41→27% に
   落ちた（被弾 0.55→0.70/100s。240 本）。気配を近づけるだけのつもりが、
   実際には鉢合わせを量産していた。遠めに寄せ、一度寄せたら calm を丸ごと待つ。 */
var DIRECTOR_NEAR = [8, 16];
var DIRECTOR_AWAY = 11;           // 散らすときはこれより遠く
var DIRECTOR_REST = 18;           // 追跡のあと何秒を「一息」にするか
function directorWant(){
  if(world.endgame) return 0;                        // 終盤は別の仕組みで常に嗅ぎつける
  if(DIRECTOR.sinceChaseT < DIRECTOR_REST) return -1;
  if(DIRECTOR.calmT > DIFF[settings.diff].calm) return 1;
  return 0;
}

/* 曲がり角の減速。直線では追いつかれるが、角を曲がるたびに踏み直す。
   逃げ方が「足の速さ」ではなく「どの角を曲がるか」の判断になる。 */
var CORNER_SLOW = 0.42;           // 直角に曲がった直後の速度の落ち幅
var CORNER_REC  = 0.65;           // 元の速さへ戻るまでの秒数
var HIDE_CHECK_T = 1.1;           // 隠れ場所の前で点検にかける秒数

var SWING_DUR = 0.46;      // 殴打モーション全体の長さ（ため→打ち抜き→戻し）

/* 追跡者の体を組み立てる道具一式。
   もとは buildHunter の中に置いていた。クロージャなので生成のたびに
   作り直され、最適化がその 1 回の中で終わってしまう。胴を掃引に変えて
   mergeBoxes を使わなくなった途端、最初の重い利用者になった腕の生成が
   34ms → 125ms へ跳ね上がって露見した。モジュール直下で 1 度だけ定義する。
   分割数と光線本数は品質で変わるので hunterSegs() で読み直す。 */
var _m = new THREE.Matrix4(), _e = new THREE.Euler();
/* 部品を 1 つのジオメトリに畳む。
   もとは箱しか置けなかったので、体のどこを見ても角が立っていた。
   円錐台（先細りの筒）と球を混ぜられるようにして、
   骨と関節の形をそのまま出せるようにする。
     type 省略      … 箱（w,h,d）
     type:'cyl'     … 円錐台（rt=上半径, rb=下半径, h=長さ）
     type:'sph'     … 球（r、sy で縦につぶす）
   分割数は品質で変える。低い端末では今までどおり粗いまま。 */
var SEG = 6;      // 生成のたびに hunterSegs() で読み直す
/* 肌テクスチャの密度。1m あたり何回繰り返すか。
   3.2 だと 30cm ごとに 1 タイル——斑と静脈がちょうど人体の縮尺に見える。 */
var UV_PER_M = 3.2;

/* --- 隙間の陰りを頂点に焼き込む -------------------------------------
   部品を重ねて体を作っているので、肋の谷・眼窩の奥・関節の付け根は
   本来なら光が届かない。ところが実行時のライトは点光源が数個しか
   無いので、そういう凹みが平らな面と同じ明るさで返ってきて、
   「粘土の塊に模様を描いた物」に見えていた。

   製品のキャラクタが必ず持っている遮蔽マップの代わりに、生成時に
   一度だけ半球へ光線を飛ばして、他の部品に当たった割合を頂点色に
   入れる。実行中の負荷はゼロ。当たり判定は部品を陰関数として持つ
   ——三角形と交差判定するより桁で速く、部品が凸なので自分自身に
   誤ヒットしない（法線側へ出た光線は自分の外へ出るだけ）。 */
function specSolid(sp){
  var e = new THREE.Euler(sp.rx||0, sp.ry||0, sp.rz||0);
  var m = new THREE.Matrix4().makeRotationFromEuler(e);
  m.setPosition(sp.x||0, sp.y||0, sp.z||0);
  /* 逆行列は要素配列のまま持つ。Vector3 を経由すると
     内側のループで 100 万回オブジェクトを触ることになり、
     これだけで焼き時間の半分を食っていた。
     回転が無い部品は引き算だけで済むので、そのぶん分ける。 */
  var s = { e:new THREE.Matrix4().copy(m).invert().elements, type:sp.type||'box',
            rot:!!(sp.rx || sp.ry || sp.rz) };
  if(sp.type === 'cyl'){ s.rt = sp.rt; s.rb = sp.rb; s.hh = sp.h/2;
    s.rmax = Math.sqrt(Math.max(sp.rt, sp.rb)*Math.max(sp.rt, sp.rb) + s.hh*s.hh); }
  else if(sp.type === 'sph'){
    s.ax = sp.r*(sp.sx||1); s.ay = sp.r*(sp.sy||1); s.az = sp.r*(sp.sz||1);
    s.ax2 = s.ax*s.ax; s.ay2 = s.ay*s.ay; s.az2 = s.az*s.az;
    s.rmax = Math.max(s.ax, s.ay, s.az);
  }else{
    s.hx = sp.w/2; s.hy = sp.h/2; s.hz = sp.d/2;
    s.rmax = Math.sqrt(s.hx*s.hx + s.hy*s.hy + s.hz*s.hz);
  }
  s.rr = s.rmax * s.rmax;
  s.cx = sp.x||0; s.cy = sp.y||0; s.cz = sp.z||0;
  return s;
}
function inSolid(s, wx, wy, wz){
  // 粗い球で弾いてから正確に見る。9 割はここで帰る
  var dx = wx-s.cx, dy = wy-s.cy, dz = wz-s.cz;
  if(dx*dx + dy*dy + dz*dz > s.rr) return false;
  var lx = dx, ly = dy, lz = dz;
  if(s.rot){
    var e = s.e;
    lx = e[0]*wx + e[4]*wy + e[8]*wz  + e[12];
    ly = e[1]*wx + e[5]*wy + e[9]*wz  + e[13];
    lz = e[2]*wx + e[6]*wy + e[10]*wz + e[14];
  }
  if(s.type === 'sph')
    return (lx*lx)/s.ax2 + (ly*ly)/s.ay2 + (lz*lz)/s.az2 < 1;
  if(s.type === 'cyl'){
    if(ly > s.hh || ly < -s.hh) return false;
    var f = (ly + s.hh) / (s.hh*2);            // 下端 0 → 上端 1
    var rc = s.rb + (s.rt - s.rb)*f;
    return lx*lx + lz*lz < rc*rc;
  }
  return lx > -s.hx && lx < s.hx && ly > -s.hy && ly < s.hy && lz > -s.hz && lz < s.hz;
}
/* 半球の光線方向。乱数で撒くと部品ごとに模様が変わって縞に見えるので、
   黄金角のらせん（どの本数でも均一に散る）で決め打ちにする。 */
var HEMI = [], HEMI_N = -1;
function hunterSegs(){
  SEG = QC.detail ? 10 : 6;
  var n = QC.hao || 1;
  if(HEMI_N === n) return;
  HEMI_N = n; HEMI = [];
  for(var i=0;i<n;i++){
    var y = (i + 0.5)/n;                        // 0..1（1 が法線方向）
    var r = Math.sqrt(1 - y*y), th = i * 2.399963;
    HEMI.push([Math.cos(th)*r, y, Math.sin(th)*r]);
  }
}
var AO_REACH = 0.13;        // これより遠い部品は陰らせない（体の寸法に対する目安）
/* 素直に「畳んだ後の全頂点 × 全部品」で回したら最高品質で +221ms 掛かった。
   手元では一瞬でも、実機では確実に待たされる長さ。効いたのは 3 つ。
     ・面をばらす前に焼く。畳んだ後は同じ座標が 6 回ずつ出てくるので、
       部品ごとのインデックス付き頂点（1/6 の数）で計算して展開する。
     ・逆行列を Vector3 経由で掛けない（inSolid の項を参照）。
     ・指も足指も凸で、周りに何も無い。届く範囲に部品が 1 つも無い
       頂点は、光線を飛ばすまでもなく明るいと決まる。
   実測 +221ms → +30.6ms（最高品質）／+13.7ms（高精細）。 */
/* 部品の代表寸法。小さすぎる部品の遮蔽を省くのに使う */
function specSize(sp){
  if(sp.type === 'cyl') return Math.max(sp.rt, sp.rb, sp.h*0.5);
  if(sp.type === 'sph') return sp.r * Math.max(sp.sx||1, sp.sy||1, sp.sz||1);
  return Math.max(sp.w, sp.h, sp.d) * 0.5;
}
var _ones = new Float32Array(0);
function ONES(n){
  if(_ones.length < n){ _ones = new Float32Array(n); _ones.fill(1); }
  return _ones;
}
function bakeSolids(specs){
  // 部品が 1 つだけなら陰るところが無い（凸なので自分自身を隠せない）
  if(!QC.hao || specs.length < 2) return null;
  var solids = [];
  for(var i=0;i<specs.length;i++) solids.push(specSolid(specs[i]));
  return solids;
}
// bg（変換済み・インデックス付き）の各頂点に対する遮蔽率を返す
function bakeAOFor(bg, solids){
  var pa = bg.attributes.position.array, na = bg.attributes.normal.array;
  var n = bg.attributes.position.count, ao = new Float32Array(n);
  if(!solids){ ao.fill(1); return ao; }
  var ns = solids.length, nr = HEMI.length, cand = [];
  var tx = new THREE.Vector3(), bx = new THREE.Vector3(), nv = new THREE.Vector3();
  var up = new THREE.Vector3(0,1,0), up2 = new THREE.Vector3(1,0,0);
  for(var v=0; v<n; v++){
    var i3 = v*3, px0 = pa[i3], py0 = pa[i3+1], pz0 = pa[i3+2];
    // 届く範囲に部品があるか。無ければ光線を飛ばさない
    cand.length = 0;
    for(var c2=0; c2<ns; c2++){
      var S = solids[c2];
      var ddx = px0-S.cx, ddy = py0-S.cy, ddz = pz0-S.cz;
      var lim = S.rmax + AO_REACH;
      if(ddx*ddx + ddy*ddy + ddz*ddz < lim*lim) cand.push(S);
    }
    if(!cand.length){ ao[v] = 1; continue; }
    var nc = cand.length;

    nv.set(na[i3], na[i3+1], na[i3+2]);
    // 法線まわりの正規直交基底。法線が真上のときだけ別の軸を使う
    tx.crossVectors(nv, Math.abs(nv.y) > 0.95 ? up2 : up).normalize();
    bx.crossVectors(nv, tx);
    var ox = px0 + nv.x*0.002, oy = py0 + nv.y*0.002, oz = pz0 + nv.z*0.002;
    var hit = 0;
    for(var r2=0; r2<nr; r2++){
      var h = HEMI[r2];
      var dx = tx.x*h[0] + nv.x*h[1] + bx.x*h[2];
      var dy = tx.y*h[0] + nv.y*h[1] + bx.y*h[2];
      var dz = tx.z*h[0] + nv.z*h[1] + bx.z*h[2];
      // 近いところほど効く。3 点で足りる（凹みの幅がこの間隔より狭いことは無い）
      for(var st=1; st<=3; st++){
        var t2 = AO_REACH * st/3;
        var qx = ox + dx*t2, qy = oy + dy*t2, qz = oz + dz*t2;
        var blocked = false;
        for(var s2=0; s2<nc; s2++){ if(inSolid(cand[s2], qx, qy, qz)){ blocked = true; break; } }
        if(blocked){ hit += (4 - st)/3; break; }   // 手前で塞がれるほど暗い
      }
    }
    // 完全に埋まっても真っ黒にはしない。周囲光が回り込む余地を残す
    ao[v] = 1 - 0.62 * Math.min(1, hit/nr);
  }
  return ao;
}

function mergeBoxes(specs){
  var pos = [], nor = [], uvs = [], cls = [];
  var solids = bakeSolids(specs);
  for(var i=0;i<specs.length;i++){
    var sp = specs[i];
    var bg;
    if(sp.type === 'cyl'){
      bg = new THREE.CylinderGeometry(sp.rt, sp.rb, sp.h, SEG, 1, true);
    }else if(sp.type === 'sph'){
      bg = new THREE.SphereGeometry(sp.r, SEG, Math.max(4, SEG>>1));
      if(sp.sy || sp.sx || sp.sz) bg.scale(sp.sx||1, sp.sy||1, sp.sz||1);
    }else{
      bg = new THREE.BoxGeometry(sp.w, sp.h, sp.d);
    }
    _e.set(sp.rx||0, sp.ry||0, sp.rz||0);
    _m.makeRotationFromEuler(_e);
    _m.setPosition(sp.x||0, sp.y||0, sp.z||0);
    /* UV を実寸に合わせる。
       部品ごとに 0..1 のまま貼っていたので、指の一節にも 512px の
       肌テクスチャが丸ごと乗り、模様が数十倍に拡大されて無地に見えていた。
       体じゅうどこも「のっぺりした一色」だった原因はこれ。
       部品の実際の周長・高さから繰り返し数を出すと、太い胴も細い指も
       同じ肌理になる。 */
    if(bg.attributes.uv){
      var uS = 1, vS = 1;
      if(sp.type === 'cyl'){
        uS = TAU * (sp.rt + sp.rb) * 0.5 * UV_PER_M;
        vS = sp.h * UV_PER_M;
      }else if(sp.type === 'sph'){
        var rr2 = sp.r * ((sp.sx||1) + (sp.sz||1)) * 0.5;
        uS = TAU * rr2 * UV_PER_M;
        vS = Math.PI * sp.r * (sp.sy||1) * UV_PER_M;
      }else{
        uS = sp.w * UV_PER_M; vS = sp.h * UV_PER_M;
      }
      // 1 周に満たないほど小さい部品でも、模様が消えない下限を持たせる
      uS = Math.max(0.35, uS); vS = Math.max(0.35, vS);
      var ua2 = bg.attributes.uv.array;
      for(var uq=0; uq<ua2.length; uq+=2){ ua2[uq] *= uS; ua2[uq+1] *= vS; }
    }
    bg.applyMatrix4(_m);
    var pa = bg.attributes.position.array,
        na = bg.attributes.normal.array,
        ua = bg.attributes.uv.array,
        ix = bg.index ? bg.index.array : null;
    /* 遮蔽はここで焼く。畳んだ後だと同じ座標を 6 回計算することになる。
       ただし指の一節や爪のように 3.5cm を下回る部品は、そこに落ちる陰りが
       画面上ほとんど見えない。焼く意味が薄いのに部品数が多いぶん頂点だけは
       多く、起動時間の大半をここで使っていた（実測：腕2本の生成に125ms）。 */
    var aoa = (solids && specSize(sp) >= 0.035) ? bakeAOFor(bg, solids)
                                                : ONES(bg.attributes.position.count);
    if(ix){
      for(var k=0;k<ix.length;k++){
        var v = ix[k];
        pos.push(pa[v*3], pa[v*3+1], pa[v*3+2]);
        nor.push(na[v*3], na[v*3+1], na[v*3+2]);
        uvs.push(ua[v*2], ua[v*2+1]);
        cls.push(aoa[v], aoa[v], aoa[v]);
      }
    }
    bg.dispose();
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  /* 頂点色は遮蔽専用。materialのvertexColorsを常に有効にしている以上、
     この属性が無いメッシュは真っ黒になる。焼かない品質でも 1 を入れる。 */
  out.setAttribute('color', new THREE.Float32BufferAttribute(cls, 3));
  out.computeBoundingSphere();
  return out;
}

/* 追跡者の皮膚のテクセル密度（1m あたりの枚数）。
   部位ごとに 0..1 で貼っていたので、周長 1.2m の胴と 0.27m の腿で
   4 倍違っていた。1.5 に揃える。 */
var SKIN_UV = 1.5;
function buildHunter(){
  hunterSegs();          // 品質に応じた分割数と光線本数を用意する
  if(hunter.group){ scene.remove(hunter.group); disposeObject(hunter.group); hunter.group = null; }
  if(hunter.shadow){ scene.remove(hunter.shadow); disposeObject(hunter.shadow); hunter.shadow = null; }
  var g = new THREE.Group();

  /* テクスチャを貼るときは色を白にしないと二重に暗くなる。
     TEX.flesh が無い環境（テクスチャ生成前の呼び出し）では従来の無地に戻す。

     法線マップを足すと、点光源が動くたびに皮膚の凹凸が起き上がる。
     色だけを貼っていたときは、模様が「描いてある」ようにしか見えず、
     掴まれる距離まで寄られると平面だと分かってしまっていた。
     粗さマップは汗の照りと乾いた肌を分ける。全面が roughness:1 だと
     どこにもハイライトが乗らず、生き物ではなく石膏に見える。 */
  var skin = new THREE.MeshStandardMaterial({
    color:TEX.flesh ? 0xffffff : 0x9ea394, map:TEX.flesh || null,
    normalMap:TEX.fleshN || null, roughnessMap:TEX.fleshR || null,
    roughness:TEX.fleshR ? 1 : 0.94, metalness:0,
    emissive:0x1d2119, emissiveIntensity:0.14, vertexColors:true
  });
  if(skin.normalMap) skin.normalScale = new THREE.Vector2(0.85, 0.85);
  /* 血の染み。痕跡のアトラス（壁と共用）の左上のタイルを胴に貼る。
     透明度を持つので深度は書かない。皮より手前に出すため多角形オフセットを
     掛ける（4mm 浮かせてあるが、遠くでは深度の精度が足りなくなる）。 */
  var stain = TEX.decal ? new THREE.MeshStandardMaterial({
    map:TEX.decal, transparent:true, roughness:0.62, metalness:0,
    depthWrite:false, polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2
  }) : new THREE.MeshStandardMaterial({ color:SRGB(0x5a3f38), roughness:1 });
  /* 髪。真っ黒のつもりの 0x0e0b0a が、寄って撮ると白い棒になっていた。
     理由は 2 つある。

     1. three r128 は色管理をしないので、material.color は sRGB ではなく
        線形の値としてそのまま使われる。0x0e0b0a は「線形 5.5% グレー」
        であって、sRGB の 5.5%（＝線形 0.4%）ではない。13 倍明るい。
        暗いつもりで置いた色が軒並み暗くなかったのはこれが原因。
     2. MeshStandardMaterial は金属でなくても 4% の鏡面反射が必ず乗る。
        暗い地色ほどその下駄が支配的になる。

     髪は繊維の束で鏡のような面を持たないので鏡面反射のない Lambert にし、
     地色も線形で暗い値まで落とす。布（病衣）も同じ理由で変える。 */
  var dark  = new THREE.MeshLambertMaterial({ color:SRGB(0x141110), vertexColors:true });
  var maw   = new THREE.MeshBasicMaterial({ color:SRGB(0x120202) });
  var eyeL_ = new THREE.MeshBasicMaterial({ color:0xffd9c0 });
  var eyeR_ = new THREE.MeshBasicMaterial({ color:0xffd9c0 });
  /* 歯。MeshBasicMaterial は光をまったく受けないので、どんなに暗い
     ところでも同じ明るさで出る。口の中にあるものが周りより明るいのは
     おかしく、平らな白い板が並んでいるようにしか見えなかった。
     光を受ける材質にし、色も象牙の実際の反射率まで落とす。 */
  var bone_ = new THREE.MeshStandardMaterial({
    color:SRGB(0x9c9384), roughness:0.44, metalness:0
  });

  /* 手足の骨。
     円錐台に球を 1 つ載せる作りだったので、関節の玉と幹の境目に必ず
     縁が出て、寄ると「棒に玉を刺した物」に見えた。胴と同じく掃引にして、
     関節の玉から幹、先の細りまでを一続きの面にする。

     ついでに筋腹（付け根寄りのふくらみ）を入れる。まっすぐ細るだけの
     筒は骨であって腕ではない。痩せた体なので膨らみは控えめにし、
     代わりに先端側をよく絞る。 */
  var BSEG = QC.detail ? 16 : 9;
  function boneRows(r, len, n){
    var rows = [], i;
    for(i=0;i<n;i++){
      var u = i/(n-1);                      // 0 が下端、1 が上端
      var y = -len + u*(len + r*1.05);
      var rr;
      if(y > 0){
        // 関節の玉。上へドームで閉じる
        var q = y/(r*1.05);
        rr = r*1.06 * Math.sqrt(Math.max(0, 1 - q*q));
      }else{
        var sdn = -y/len;                   // 0（付け根）〜1（先端）
        rr = r * (1.02 - 0.30*sdn) * (1 + 0.085*Math.sin(Math.PI*Math.min(1, sdn*1.7)));
      }
      rows.push({ y:y, rx:Math.max(rr, r*0.06), rz:Math.max(rr*0.94, r*0.06) });
    }
    return rows;
  }
  function boneDown(w, len, d, mat){
    var r = w * 0.5;
    var m = new THREE.Mesh(loftGeo(boneRows(r, len, QC.detail ? 15 : 9), BSEG, null,
                                   { capA:r*0.42, capB:r*0.10, uvPerM:SKIN_UV }), mat || skin);
    m.userData.loft = true;
    return m;
  }
  /* 任意の向きへ骨を 1 本生やして、次の関節の座標を返す。
     指と足指は「付け根から少しずつ曲がりながら細くなる鎖」なので、
     座標を直接書くと角度を変えるたびに全部書き直しになる。

     mergeBoxes の回転は XYZ 順のオイラー角なので、円柱の +Y 軸は
     (-sinψ, cosψ·cosθ, cosψ·sinθ) へ写る。これを望む向き d と等しいと
     置いて ψ と θ を逆算する。 */
  function chain(out, p, dir, len, rBase, rTip){
    var L = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]) || 1;
    var dx = dir[0]/L, dy = dir[1]/L, dz = dir[2]/L;
    var psi = Math.asin(clamp(-dx, -1, 1));
    var cp = Math.cos(psi);
    var th = (Math.abs(cp) < 1e-4) ? 0 : Math.atan2(dz/cp, dy/cp);
    out.push({ type:'cyl', rt:rTip, rb:rBase, h:len, rx:th, rz:psi,
               x:p[0] + dx*len/2, y:p[1] + dy*len/2, z:p[2] + dz*len/2 });
    // 関節の玉。曲げたときに継ぎ目が開かないので、鎖に見えず 1 本の指になる
    out.push({ type:'sph', r:rBase*1.05, x:p[0], y:p[1], z:p[2] });
    return [p[0] + dx*len, p[1] + dy*len, p[2] + dz*len];
  }
  function boneUp(w, len, d, mat){
    var r2 = w * 0.5;
    // 上へ伸びる骨は、下向きの骨を上下ひっくり返して使う
    var g2 = loftGeo(boneRows(r2, len, QC.detail ? 15 : 9), BSEG, null,
                     { capA:r2*0.42, capB:r2*0.10, uvPerM:SKIN_UV });
    g2.scale(1, -1, 1);
    g2.computeVertexNormals(); fixNormals(g2);
    var m2 = new THREE.Mesh(g2, mat || skin);
    m2.userData.loft = true;
    return m2;
  }

  var THIGH = 0.50, SHIN = 0.52, SOLE = 0.57;
  var spine = new THREE.Group();
  spine.position.y = 0.02 + THIGH + SOLE;
  g.add(spine);

  /* --- 痩せこけた胴 ---
     筒 3 本と潰した球 12 個を重ねて作っていた。数を増やしても部品の縁が
     面の途中に出てくるので、寄られると「何かを積んだ物」に見える。
     腰から肩まで断面を少しずつ変えながら掃いて、一続きの皮にする。
     肋も背骨も胸骨も鎖骨も、貼り足す部品ではなく皮そのものの起伏として
     作る（半径を角度と高さの関数にする）。谷は自動的に暗くなる。 */
  var TR = [
    // y,     rx,    rz     … 下から上へ。骨盤→腰のくびれ→肋郭→肩
    [-0.075, 0.150, 0.128], [-0.020, 0.171, 0.145], [ 0.040, 0.175, 0.146],
    [ 0.100, 0.163, 0.136], [ 0.160, 0.148, 0.124], [ 0.225, 0.138, 0.116],
    [ 0.295, 0.134, 0.113], [ 0.365, 0.137, 0.116], [ 0.435, 0.146, 0.123],
    [ 0.505, 0.163, 0.132], [ 0.575, 0.184, 0.143], [ 0.645, 0.204, 0.152],
    [ 0.715, 0.220, 0.158], [ 0.785, 0.230, 0.161], [ 0.850, 0.235, 0.161],
    [ 0.905, 0.236, 0.158], [ 0.950, 0.230, 0.150], [ 0.985, 0.213, 0.137],
    [ 1.010, 0.185, 0.120], [ 1.028, 0.140, 0.093]
  ];
  var torsoRows = TR.map(function(r){ return { y:r[0], rx:r[1], rz:r[2] }; });
  var TSEG = QC.detail ? 26 : 14;
  function torsoRad(th, v){
    var m = 1;
    var front = Math.max(0, Math.sin(th));          // +Z が正面
    var back  = Math.max(0, -Math.sin(th));
    var side  = Math.abs(Math.cos(th));
    /* 肋。胸の高さ（v 0.44〜0.80）に 6 本、正面と側面に回り込ませる。
       山より谷を深くすると、皮の下に骨がある見え方になる。 */
    var rv = (v - 0.44) / 0.36;
    if(rv > 0 && rv < 1){
      var w = Math.sin(rv*Math.PI);                 // 端で 0 になるので継ぎ目が出ない
      var rib = Math.sin(rv*Math.PI*6.0);
      m += w * (front*0.090 + side*0.062) * (rib > 0 ? rib*0.55 : rib);
    }
    // 胸骨の縦の溝。正面のまん中だけ落とす
    m -= 0.038 * Math.exp(-Math.pow((th - Math.PI/2)/0.28, 2)) * Math.max(0, Math.sin((v-0.36)*3.0));
    // 背骨の溝。腰から首まで通す
    m -= 0.058 * Math.exp(-Math.pow((th + Math.PI/2)/0.24, 2)) * (0.35 + 0.65*v);
    // 肩甲骨の張り。背中の左右に 2 枚
    var sc = Math.exp(-Math.pow((v-0.80)/0.10, 2));
    m += back * side * 0.055 * sc;
    // 鎖骨。肩のすぐ下で正面に横一文字の稜線
    m += front * 0.045 * Math.exp(-Math.pow((v-0.90)/0.045, 2));
    // 腸骨の張り。骨盤の左右
    m += side * 0.050 * Math.exp(-Math.pow((v-0.06)/0.055, 2));
    return m;
  }
  var torsoGeo = loftGeo(torsoRows, TSEG, torsoRad, { capA:0.06, capB:0.03, uvPerM:SKIN_UV });
  var torsoMesh = new THREE.Mesh(torsoGeo, skin);
  /* 掃引の陰りは半径の起伏から直接出しているので、光線を飛ばす焼き込み
     （QC.hao）とは別物。品質に関係なく掛かる。自己診断が両者を混同
     しないように印を付ける。 */
  torsoMesh.userData.loft = true;
  spine.add(torsoMesh);

  /* 腹の血の染み。以前は 0.2×0.3m・厚さ 1cm の直方体を胴の前に浮かせて
     いた。12 三角形で面の向きが一定なので、どんな光でも一様な塗りにしか
     ならず、寄られると「桃色のシールを貼った物」に見えた。実際、至近で
     撮ると腹に平らな桃色の長方形が乗っていた。
     胴と同じ式で面を作り、4mm だけ外へ出して貼る。皮の起伏に沿うので
     縁が立たず、肋の谷では暗く、山では明るくなる。 */
  // 正面（+Z）はθ=π/2。そこから少し脇へずらして左胸から腹にかけて垂らす
  spine.add(torsoDecal(Math.PI*0.5 - 0.30, 0.30, 0.74, 1.25));

  function torsoDecal(thC, y0, y1, thW){
    var NU = QC.detail ? 14 : 8, NV = QC.detail ? 12 : 7;
    var pos = [], uv = [], ind = [];
    var yA = TR[0][0], yB = TR[TR.length-1][0];
    for(var j=0; j<=NV; j++){
      var ty = y0 + (y1-y0)*(j/NV);
      // 行を y で線形補間する（行の間隔は一定ではない）
      var ri = 0;
      while(ri < TR.length-2 && TR[ri+1][0] < ty) ri++;
      var f = (ty - TR[ri][0]) / (TR[ri+1][0] - TR[ri][0]);
      var rx = TR[ri][1] + (TR[ri+1][1]-TR[ri][1])*f;
      var rz = TR[ri][2] + (TR[ri+1][2]-TR[ri][2])*f;
      var vv = (ty - yA) / (yB - yA);
      for(var i2=0; i2<=NU; i2++){
        var th = thC + (i2/NU - 0.5)*thW;
        var m2 = torsoRad(th, vv) + 0.026;      // 皮の 4mm ほど外
        pos.push(Math.cos(th)*rx*m2, ty, Math.sin(th)*rz*m2);
        // 痕跡アトラスの左上（血）だけを使う。端は少し内側へ寄せる
        uv.push(0.04 + 0.42*(i2/NU), 0.54 + 0.42*(j/NV));
      }
    }
    for(var j2=0; j2<NV; j2++) for(var i3=0; i3<NU; i3++){
      var a4 = j2*(NU+1)+i3, b4 = a4+1, c4 = a4+NU+1, d4 = c4+1;
      ind.push(a4, c4, b4, b4, c4, d4);
    }
    var dg = new THREE.BufferGeometry();
    dg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    dg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    dg.setIndex(ind); dg.computeVertexNormals(); fixNormals(dg);
    return new THREE.Mesh(dg, stain);
  }

  // --- 首は独立させ、追いつめると不自然に伸びる ---
  var neck = boneUp(0.10, 0.26, 0.10);
  neck.position.y = 0.90; spine.add(neck);

  var headPivot = new THREE.Group();
  headPivot.position.y = 0.26; neck.add(headPivot);

  /* 頭蓋。
     球 3 つに眉の箱を 1 つ足していた。丸い塊に板が刺さった見た目で、
     顔と呼べるものが無かった（暗がりでは「白い卵」）。
     体と同じ掃引で作り、顎から頭頂まで一続きの面にする。
     顔を顔にしているのは、眉弓の張り出し・こめかみの窪み・頬骨・
     鼻梁・落ちくぼんだ眼窩・削げた頬——どれも面の起伏なので、
     半径の関数として書ける。谷は自動的に陰る。 */
  var HD = [
    // y,     rx,    rz     … 顎の下から頭頂へ
    [-0.090, 0.052, 0.060], [-0.060, 0.072, 0.082], [-0.030, 0.087, 0.096],
    [ 0.000, 0.098, 0.106], [ 0.030, 0.107, 0.113], [ 0.060, 0.114, 0.119],
    [ 0.090, 0.119, 0.123], [ 0.120, 0.122, 0.125], [ 0.150, 0.122, 0.124],
    [ 0.178, 0.117, 0.118], [ 0.202, 0.106, 0.106], [ 0.221, 0.086, 0.086],
    [ 0.234, 0.058, 0.058]
  ];
  var headRows = HD.map(function(r){
    // 後頭部を少し後ろへ出す（骸骨らしい横顔になる）
    return { y:r[0], rx:r[1], rz:r[2], cz:-0.012 - 0.020*Math.max(0, (r[0]-0.02))*3 };
  });
  var HSEG = QC.detail ? 24 : 13;
  var headGeo = loftGeo(headRows, HSEG, function(th, v){
    var m = 1;
    var front = Math.max(0, Math.sin(th));       // +Z が正面
    var side  = Math.abs(Math.cos(th));
    var fr2   = front*front;
    // 眉弓。目の上に横一文字で張り出す
    m += fr2 * 0.085 * Math.exp(-Math.pow((v-0.685)/0.045, 2));
    // 眼窩。眉のすぐ下、正面のやや外寄りを落とす
    var eye = Math.exp(-Math.pow((v-0.625)/0.050, 2));
    var offc = Math.exp(-Math.pow((Math.abs(th - Math.PI/2) - 0.52)/0.30, 2));
    m -= 0.075 * eye * offc;
    // 鼻梁。正面のまん中だけ前へ出し、下ほど強くする
    m += 0.070 * Math.exp(-Math.pow((th - Math.PI/2)/0.24, 2))
              * Math.exp(-Math.pow((v-0.545)/0.130, 2));
    // 頬骨。目の下の外側を張らせる
    m += 0.048 * Math.exp(-Math.pow((v-0.520)/0.060, 2)) * offc;
    // 削げた頬。頬骨の下を大きく落とす
    m -= 0.070 * Math.exp(-Math.pow((v-0.400)/0.085, 2)) * offc * front;
    // こめかみの窪み
    m -= 0.040 * side * Math.exp(-Math.pow((v-0.700)/0.060, 2));
    // 後頭部のふくらみ
    m += 0.045 * Math.max(0, -Math.sin(th)) * Math.exp(-Math.pow((v-0.640)/0.170, 2));
    return m;
  }, { capA:0.030, capB:0.020, uvPerM:SKIN_UV });
  var headMesh = new THREE.Mesh(headGeo, skin);
  headMesh.userData.loft = true;
  headPivot.add(headMesh);

  /* 落ち窪んだ眼窩の影。
     7.5×6×4cm の直方体を 2 つ顔に貼っていた。下から見上げると、
     顔に黒い立方体が二つ乗っているようにしか見えない（実際そう見えた）。
     頭蓋には既に眼窩の窪みが彫ってあるので、そこへ収まる潰した回転楕円を
     置く。眼球はこの奥に沈んだままで、追ってくるときだけ光る。 */
  var socketGeos = [];
  for(var ei=0; ei<2; ei++){
    var sg = new THREE.SphereGeometry(0.040, QC.detail?14:8, QC.detail?10:6);
    sg.scale(1.02, 0.74, 0.52);
    sg.translate((ei ? 1 : -1)*0.055, 0.076, 0.107);
    var sc2 = new Float32Array(sg.attributes.position.count*3); sc2.fill(1);
    sg.setAttribute('color', new THREE.Float32BufferAttribute(sc2, 3));
    socketGeos.push(sg);
  }
  var socketMesh = new THREE.Mesh(mergeGeos(socketGeos), dark);
  headPivot.add(socketMesh);

  /* 髪。頭頂から生やし、正面（顔の中央）は空けて後ろと側面へ流す。
     以前は直径 5.2cm のまっすぐな円柱 10 本で、寄って撮ると木の板が
     並んでいるようにしか見えなかった。扁平な束を曲線で垂らす。
     束ごとに長さ・太さ・うねりの位相を変える。 */
  var hairGeos = [], HN = QC.detail ? 20 : 9;
  for(var hi=0; hi<HN; hi++){
    var ang = 0.62 + hi*(TAU - 1.24)/(HN-1);   // 正面 ±0.62rad を除いた全周
    var hl = 0.40 + ((hi*7) % 5) * 0.105;
    var hg = hairRibbon(hl, 0.028 + ((hi*3)%4)*0.005, 0.028, hi*0.83);
    /* 束の平たい面を頭の接線に合わせる。回さないと、どの束も同じ向きの
       板になって、頭の側面では厚みだけが見える。 */
    hg.rotateY(ang);
    // 生え際は頭皮のドームより下から始める（上へ突き抜けさせない）
    hg.translate(Math.sin(ang)*0.104, 0.178, Math.cos(ang)*0.104);
    hairGeos.push(hg);
  }
  /* 頭頂の生え際。以前は 25cm 角の板を 1 枚載せていたので、真上から
     見ると頭に平らな蓋が乗っていた。頭に沿う浅いドームにする。
     頂点色を使う材質なので、色属性の無いジオメトリを混ぜるとそこだけ
     真っ黒になる。ONES() は使い回しの配列で長さが合わないため実寸で作る。 */
  var scalp = new THREE.SphereGeometry(0.126, QC.detail?16:10, QC.detail?7:4,
                                       0, TAU, 0, Math.PI*0.44);
  scalp.scale(1, 0.62, 1);
  scalp.translate(0, 0.150, 0);
  var scalpC = new Float32Array(scalp.attributes.position.count * 3);
  scalpC.fill(1);
  scalp.setAttribute('color', new THREE.Float32BufferAttribute(scalpC, 3));
  hairGeos.push(scalp);
  var hairMesh = new THREE.Mesh(mergeGeos(hairGeos), dark);
  /* 掃引の陰りは半径の起伏から出しているので、光線を飛ばす焼き込み
     （QC.hao）とは別物。自己診断が両者を混同しないよう印を付ける。 */
  hairMesh.userData.loft = true;
  headPivot.add(hairMesh);

  /* 目。
     光る点を 1 つ置いただけだったので、近くで見ると「顔に貼った電球」で、
     どこを見ているのか分からなかった。眼球（濡れて低い粗さ）・虹彩・
     瞼の三層にすると、視線の向きが読めるようになり、瞬きも作れる。
     pupL/pupR は入れ物の Group にして、位置を動かす既存の処理はそのまま使う。 */
  var eyeball = new THREE.MeshStandardMaterial({
    color:0xbfc4b4, roughness:0.18, metalness:0,
    emissive:0x141812, emissiveIntensity:0.4
  });
  var ebGeo = new THREE.SphereGeometry(0.0215, QC.detail?12:8, QC.detail?8:6);
  var irisGeo = new THREE.SphereGeometry(0.0125, 8, 6);
  function eye(sx, irisMat){
    var grp = new THREE.Group();
    grp.position.set(sx*0.055, 0.075, 0.118);
    var eb = new THREE.Mesh(ebGeo, eyeball);
    eb.position.z = -0.013; grp.add(eb);            // 眼窩に少し沈める
    var ir = new THREE.Mesh(irisGeo, irisMat);
    ir.scale.set(1, 1, 0.55); grp.add(ir);          // 虹彩は前へ張り出す
    headPivot.add(grp);
    return grp;
  }
  var pupL = eye(-1, eyeL_), pupR = eye(1, eyeR_);
  // 上瞼。落ちくぼんだ眼窩の庇になり、上からの光で目元に影が入る
  var lidL = new THREE.Mesh(mergeBoxes([
    { type:'sph', r:0.030, sy:0.42, sz:0.62, y:0.019, z:-0.004, rx:-0.30 }
  ]), skin);
  lidL.position.set(-0.055, 0.075, 0.116); headPivot.add(lidL);
  var lidR = lidL.clone(); lidR.position.x = 0.055; headPivot.add(lidR);
  // 暗がりで滲む光。遠くからでも二つの赤い点として見える
  var glowL = new THREE.Sprite(new THREE.SpriteMaterial({
    map:TEX.glowR, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.9
  }));
  glowL.scale.set(0.30, 0.30, 1);
  glowL.position.copy(pupL.position); headPivot.add(glowL);
  var glowR = glowL.clone();
  glowR.material = glowL.material;
  glowR.position.copy(pupR.position); headPivot.add(glowR);

  // 口の奥。8x6 分割だと黒い多角形が顔に貼ってあるように見える
  var mouth = new THREE.Mesh(
    new THREE.SphereGeometry(0.072, QC.detail?16:9, QC.detail?11:6), maw);
  mouth.position.set(0, -0.035, 0.075); headPivot.add(mouth);

  var jawPivot = new THREE.Group();
  jawPivot.position.set(0, 0, 0.02); headPivot.add(jawPivot);
  // 顎も丸める。頭蓋が球になったので、ここだけ角柱だと継ぎ目が目立つ
  var jaw = new THREE.Mesh(mergeBoxes([
    { type:'sph', r:0.093, sy:0.72, sz:1.02 },
    { type:'sph', r:0.062, sy:0.60, y:-0.015, z:0.062 }
  ]), skin);
  jaw.position.set(0, -0.09, 0.03); jawPivot.add(jaw);
  var teethSpecs = [];
  for(var ti=0; ti<5; ti++)
    teethSpecs.push({ type:'cyl', rt:0.012, rb:0.004, h:0.048,
                      x:-0.06+ti*0.03, y:-0.02, z:0.1, rx:Math.PI });
  jawPivot.add(new THREE.Mesh(mergeBoxes(teethSpecs), bone_));

  /* --- 病衣の裂けた裾 ---
     骨と皮だけだと、暗がりでは棒に見える。腰から下がった布があると
     輪郭が出て、歩くたびに遅れて揺れるぶん「重さ」も伝わる。
     板ではなく細い短冊の集まりにして、裂けた裾に見せる。 */
  var gownMat = new THREE.MeshLambertMaterial({
    color:SRGB(0x585444), side:THREE.DoubleSide,
    emissive:0x0a0b07, emissiveIntensity:0.35
  });
  var gown = [];
  var gn = QC.detail ? 11 : 7;
  for(var gi=0; gi<gn; gi++){
    var ga = (gi/gn)*TAU;
    /* 短冊 1 枚の曲率半径が 0.062m なのに、それを並べている胴の半径は
       0.155m あった。体の丸みの半分以下の弧を、しかも体表から浮かせた
       位置に置いていたので、布が胴を包まず「腰に板が何枚か刺さっている」
       ように見えていた。殴打で上体をひねると、その板が一緒に振り回されて
       腰から謎の物体が生えているように読める。
       弧の半径を胴に合わせ、回転の中心も胴の中心に置く。裾へ向けて
       少し広がらせると、布として垂れて見える。 */
    var gpv = new THREE.Group();
    gpv.position.set(0, 0.30, 0);
    gpv.rotation.y = ga;
    spine.add(gpv);
    var glen = 0.42 + ((gi*7)%5)*0.075;          // 裾の長さを不揃いに
    var gArc = TAU/gn * 0.86;                    // 隣と少し隙間をあける
    var strip = new THREE.Mesh(new THREE.CylinderGeometry(0.138, 0.168, glen, 6, 1, true,
                                                          -gArc/2, gArc), gownMat);
    strip.position.set(0, -glen/2, 0);
    gpv.add(strip);
    gown.push(gpv);
  }

  // --- 肩から垂れる、長すぎる髪の束。動きが本体から遅れる ---
  /* 束の付け根が背骨から左右 ±0.40m も離れていて、肩幅（0.235m）の外側の
     何も無い空中から生えていた。実際に撮ると蜘蛛の脚が生えたように見える。
     肩に載る幅まで詰める。 */
  var strands = [];
  var sn2 = QC.detail ? 5 : 2;
  for(var t=0; t<sn2; t++){
    var pivot = new THREE.Group();
    pivot.position.set((t - (sn2-1)/2)*0.085, 0.92, -0.135);
    spine.add(pivot);
    /* 束は 2.2cm 角の直方体だった。断面が正方形なので、揺れてもねじれても
       同じ幅にしか見えず、木の棒が下がっているようだった。
       頭の髪と同じ扁平な束にする。 */
    var sp2 = [];
    for(var q=0; q<3; q++){
      var L = 0.42 + ((t+q)%3)*0.17;
      var rg = hairRibbon(L, 0.026, -0.020, (t*3+q)*1.31);
      rg.rotateY((q-1)*0.42);
      rg.translate((q-1)*0.026, 0, (q%2)*0.016);
      sp2.push(rg);
    }
    var strandMesh = new THREE.Mesh(mergeGeos(sp2), dark);
    strandMesh.userData.loft = true;
    pivot.add(strandMesh);
    strands.push(pivot);
  }

  // --- 異常に長い腕 ---
  function arm(sx){
    var up = boneDown(0.085, 0.58, 0.085);
    up.position.set(sx*0.27, 0.9, 0); spine.add(up);
    var fore = boneDown(0.07, 0.66, 0.07);
    fore.position.set(0, -0.58, 0); up.add(fore);
    var hand = boneDown(0.06, 0.16, 0.05);
    hand.position.set(0, -0.66, 0); fore.add(hand);

    /* 手。
       まっすぐな棒を 4 本ぶら下げていただけだったので、掴みかかって
       きたときに熊手にしか見えなかった。人の指は 3 節あり、力を抜くと
       必ず内側へ丸まる。節ごとに角度を足していくと、その丸まりが出る。
       親指だけは他の指と向かい合うので、横へ開いてから曲げる。 */
    var fg = [];
    /* 中手骨（手の甲の中の骨）。手首から指の付け根へ広がる。
       終点はナックルの座標そのものにする。向きと長さを別々に書くと
       骨の先と関節の玉がずれて、指が浮いて見える。 */
    var KNU = [];
    for(var f=0; f<4; f++){
      var wr = [(-0.014 + f*0.009)*sx, -0.035, 0];
      var kn = [(-0.036 + f*0.024)*sx, -0.086, 0.004 + Math.abs(f - 1.4)*0.004];
      var dv = [kn[0]-wr[0], kn[1]-wr[1], kn[2]-wr[2]];
      chain(fg, wr, dv, Math.sqrt(dv[0]*dv[0] + dv[1]*dv[1] + dv[2]*dv[2]), 0.0125, 0.0115);
      KNU.push(kn);
    }
    /* 指の丸め。走っているときは獲物へ伸ばした鉤爪、歩いているときは
       力の抜けた半握り。角度 1 つで決まるので、同じ手を丸め違いで 2 体
       作り、姿勢側で見せ分ける（指に関節を持たせると 5 本 × 3 節 ×
       左右で 30 個のジョイントが増え、結合ジオメトリの利点が消える）。 */
    function digits(dst, curl){
    for(var f2=0; f2<4; f2++){
      // 中指・薬指が長い。長さの順序は 中 > 薬 > 示 > 小
      var scl = [0.90, 1.0, 0.96, 0.80][f2];
      var seg = [0.070*scl, 0.050*scl, 0.036*scl];
      var rad = [0.0118, 0.0100, 0.0080, 0.0062];
      var a = 0.34 + f2*0.03 + curl*0.55, p = KNU[f2];
      for(var k=0; k<3; k++){
        p = chain(dst, p, [0, -Math.cos(a), Math.sin(a)], seg[k], rad[k], rad[k+1]);
        a += 0.44 + curl*0.30;                       // 節ごとに内へ丸める
      }
      // 爪。伸びきって尖っている
      dst.push({ type:'cyl', rt:0.0016, rb:0.0058, h:0.020,
                x:p[0], y:p[1]-Math.cos(a)*0.010, z:p[2]+Math.sin(a)*0.010,
                rx:Math.PI - a });
    }
    // 親指。体側（内側）へ回り込ませる。外へ張ると手が熊手に戻る
    var tp = [-0.030*sx, -0.030, 0.004];
    var ta = 0.95 + curl*0.45;
    for(var k2=0; k2<3; k2++){
      tp = chain(dst, tp, [-0.34*sx, -Math.cos(ta), Math.sin(ta)],
                 [0.056, 0.044, 0.032][k2], [0.0135, 0.0110, 0.0088][k2],
                 [0.0110, 0.0088, 0.0070][k2]);
      ta += 0.40 + curl*0.26;
    }
    }
    var fgOpen = fg.slice(), fgCurl = fg.slice();
    digits(fgOpen, 0);
    digits(fgCurl, 1);
    var mOpen = new THREE.Mesh(mergeBoxes(fgOpen), skin);
    var mCurl = new THREE.Mesh(mergeBoxes(fgCurl), skin);
    mCurl.visible = false;
    hand.add(mOpen); hand.add(mCurl);
    return { up:up, fore:fore, hand:hand, open:mOpen, curl:mCurl };
  }
  var armL = arm(-1), armR = arm(1);

  // --- 逆関節の脚 ---
  function leg(sx){
    var th = boneDown(0.105, THIGH, 0.105);
    th.position.set(sx*0.12, 0.02, 0); spine.add(th);
    var sn = boneDown(0.085, SHIN, 0.085);
    sn.position.set(0, -THIGH, 0); th.add(sn);
    /* 足。
       箱を 1 つ置いていただけで、しかも頂点色を持たないので遮蔽も
       焼けていなかった。逆関節の脚なのだから、踵は浮いて指の付け根で
       体重を受けているはず。踵・甲・指球・4 本の指に分ける。 */
    /** @type {Array<any>} */
    var fs = [
      { type:'sph', r:0.050, sy:0.60, sz:0.92, y:0.004, z:-0.058 },   // 踵
      { type:'cyl', rt:0.046, rb:0.042, h:0.16, rx:Math.PI/2, y:-0.006, z:0.022 }, // 甲
      { type:'sph', r:0.054, sy:0.58, sz:0.78, y:-0.012, z:0.098 }    // 指球
    ];
    for(var tf=0; tf<4; tf++){
      var tx2 = -0.037 + tf*0.025, tl2 = 0.058 - Math.abs(tf-1.1)*0.009;
      var tp2 = chain(fs, [tx2, -0.016, 0.098], [tx2*0.5, -0.16, 1], tl2, 0.0125, 0.0098);
      fs.push({ type:'cyl', rt:0.0018, rb:0.0062, h:0.017,
                x:tp2[0], y:tp2[1]-0.002, z:tp2[2]+0.008, rx:Math.PI/2 + 0.2 });
    }
    var ft = new THREE.Mesh(mergeBoxes(fs), skin);
    ft.position.set(0, -0.54, 0.04); sn.add(ft);
    var tip = new THREE.Object3D();
    tip.position.set(0, -SOLE, 0); sn.add(tip);
    return { thigh:th, shin:sn, foot:ft, tip:tip };
  }
  var legL = leg(-1), legR = leg(1);

  /* --- 体の汚れの階調 ---
     どの部位も同じ反射率で塗られていたので、暗がりで見ると
     「石膏の人形」に見えた。実際の体は、床と壁に触れ続ける足先と
     手先ほど汚れて沈み、心臓から遠いほど血色が引いて青みが差す。
     頂点色に焼く（照明ではないので、姿勢が変わっても付いて回る）。

     部位ごとに書くのではなく、組み上がった姿勢での「床からの高さ」で
     決める。手は腕の先で低い位置に来るので、書き分けなくても自然に
     手先が汚れる。 */
  (function(){
    g.updateMatrixWorld(true);
    var v3 = new THREE.Vector3(), fc = [0,0,0];
    g.traverse(function(o){
      if(!o.isMesh || o.material !== skin) return;
      var ca = o.geometry.attributes.color, pa = o.geometry.attributes.position;
      if(!ca || !pa) return;
      /* 汚れを掛ける前の値を控える。姿勢が変わったあとに割り戻そうとして
         一度失敗した——焼いたのは静止姿勢の高さなので、動いたあとの
         行列で割ると別の値になる。自己診断はここに控えた範囲を見る。 */
      var lo3 = 1, hi3 = 0, sum3 = 0;
      for(var q5=0; q5<ca.count; q5++){
        var v5 = ca.getX(q5);
        if(v5 < lo3) lo3 = v5;
        if(v5 > hi3) hi3 = v5;
        sum3 += v5;
      }
      o.userData.ao = { min:lo3, max:hi3, sum:sum3, n:ca.count };
      var ar = ca.array, pr = pa.array;
      for(var i=0;i<pa.count;i++){
        v3.set(pr[i*3], pr[i*3+1], pr[i*3+2]).applyMatrix4(o.matrixWorld);
        bodyDirt(v3.y, fc);
        ar[i*3] *= fc[0]; ar[i*3+1] *= fc[1]; ar[i*3+2] *= fc[2];
      }
      ca.needsUpdate = true;
    });
  })();

  if(QC.shadows){ g.traverse(function(o){ if(o.isMesh) o.castShadow = true; }); }

  var sh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.6,1.6),
    new THREE.MeshBasicMaterial({ map:TEX.shadow, transparent:true, depthWrite:false, opacity:0.8 })
  );
  sh.rotation.x = -Math.PI/2; sh.position.y = 0.03;

  hunter.group = g;
  hunter.shadow = sh;
  hunter.parts = {
    spine:spine, neck:neck, head:headPivot, jaw:jawPivot,
    armL:armL, armR:armR, legL:legL, legR:legR,
    pupL:pupL, pupR:pupR, eyeMatL:eyeL_, eyeMatR:eyeR_, glowL:glowL, glowR:glowR,
    strands:strands, gown:gown, skin:skin, baseY:(0.02 + THIGH + SOLE)
  };
  /* 組み上がった全メッシュに対して、最後にもう一度だけ法線を検める。
     途中の各所で守ってはいるが、部品の作り方は 6 通りあり、どれかを
     増やしたときに漏れる。ここで一度掛けておけば、作り方が増えても
     NaN の法線が実機へ出ていくことはない。 */
  var nanFix = 0;
  g.traverse(function(o){ if(o.isMesh && o.geometry) nanFix += fixNormals(o.geometry); });
  scene.add(g); scene.add(sh);
  g.visible = false; sh.visible = false;
}

function placeHunter(reach, startC){
  var field = bfsField(world.grid, startC.x, startC.y);
  var best = null, bestD = -1;
  reach.forEach(function(c){
    var d = field[idx(c.x,c.y)];
    if(d > bestD && d > 9){ bestD = d; best = c; }
  });
  if(!best) best = reach[reach.length-1] || {x:GW-2,y:GH-2};
  var w = cellToWorld(best.x, best.y);
  hunter.x = w.x; hunter.z = w.z;
  hunter.cell = {x:best.x, y:best.y};
  hunter.target = null; hunter.mode = 'patrol';
  hunter.repathT = 0; hunter.patrolT = 0; hunter.lastSeen = null;
  hunter.attackCd = 0; hunter.bob = 0; hunter.patrolGoal = null; hunter.patrolT = 0;
  hunter.memT = 0; hunter.chaseT = 0; hunter.twitchT = 0; hunter.twitch = 0;
  hunter.stepAcc = 0; hunter.jawOpen = 0; hunter.reach = 0; hunter.gaitRun = 0; hunter.turnLead = 0; hunter.walkK = 0; hunter.bank = 0; hunter.yawRate = 0; hunter.yawPrev = undefined;
  // 種を固定しても再現しなかった原因。ここが Math.random だと最初のグリッチが
  // 鳴る時刻がずれ、rnd() を消費する順番が変わって以降すべてが食い違う
  hunter.glitchT = 2 + rndFx()*3; hunter.glitch = 0; hunter.stunT = 0;
  hunter.windT = 0; hunter.swingT = 0;
  hunter.dirX = 0; hunter.dirZ = 0; hunter.cornerK = 0; hunter.inspect = null; hunter.inspectT = 0;
  DIRECTOR.calmT = 0; DIRECTOR.sinceChaseT = 999;
  hunter.stuckT = 0; hunter.slideDir = 0; hunter.noDirectT = 0; hunter.punchArm = 1;
  hunter.gazeT = 0; hunter.gazeY = 0; hunter.gazeTarget = 0;
  hunter.eyeT = 2 + rndFx()*3; hunter.eyeOff = 0;
  hunter.spawnGrace = 3.0;
  hunter.group.visible = true; hunter.shadow.visible = true;
  hunter.group.position.set(hunter.x, 0, hunter.z);
}


/* --- 徘徊する患者（設計指示書 第 5.4 節・第 9.1 節） ------------------------
   壁を向いて立ったまま動かない。所見 05-01 の「全員が同じ方向を向いて
   座っている」を、そのまま病棟に置く。
   襲ってはこない。ただし灯りを顔に向けられる・すぐそばを走られる・
   触れるほど寄られると振り向いて叫び、叫び声のした場所へあれを呼ぶ。
   体は追跡者を組み上げた直後（まだ一度も動かしていない静止姿勢）を
   写し取り、材質ごとに 1 つのメッシュへ畳む。40 部品を毎回 40 回描くと
   iPhone の描画予算（第 7.2 節：最低端末で 150）をこれだけで食い潰す。 */
var patients = [];
var PATIENT_NOTICE = 6.0;         // これより近いときだけ気づく（視線が通っていること）
var PATIENT_STARE = 6.0;          // 叫んだあと、こちらを見続ける秒数
var PATIENT_COOL = 20;            // 同じ患者が次に騒ぐまで
var patientMats = {};
function patientMat(m){
  if(patientMats[m.uuid]) return patientMats[m.uuid];
  var c = m.clone();
  if(c.color) c.color.multiplyScalar(0.72);          // 追跡者より灰色がかって見えるように
  if(c.emissive){ c.emissive.setRGB(0, 0, 0); c.emissiveIntensity = 0; }
  patientMats[m.uuid] = c;
  return c;
}
function bakeFigure(src){
  src.updateMatrixWorld(true);
  var inv = new THREE.Matrix4().copy(src.matrixWorld).invert();
  var byMat = {}, keys = [];
  src.traverseVisible(function(o){
    if(!o.isMesh || Array.isArray(o.material) || !o.material) return;
    var g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    var n = g.attributes.position.count;
    // 畳むには属性の組が揃っていないといけない。無い物は埋め、余計な物は捨てる
    if(!g.attributes.normal) g.computeVertexNormals();
    if(!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n*2), 2));
    if(!g.attributes.color){ var one = new Float32Array(n*3); one.fill(1);
      g.setAttribute('color', new THREE.Float32BufferAttribute(one, 3)); }
    Object.keys(g.attributes).forEach(function(k){
      if(k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k); });
    g.morphAttributes = {};
    var key = o.material.uuid;
    if(!byMat[key]){ byMat[key] = { mat:o.material, list:[] }; keys.push(key); }
    byMat[key].list.push(g);
  });
  var out = new THREE.Group();
  keys.forEach(function(k){
    var merged = THREE.BufferGeometryUtils.mergeGeometries(byMat[k].list, false);
    byMat[k].list.forEach(function(g){ g.dispose(); });
    if(!merged) return;
    fixNormals(merged);
    out.add(new THREE.Mesh(merged, patientMat(byMat[k].mat)));
  });
  return out;
}
function clearPatients(){
  patients.forEach(function(p){ if(p.group.parent) p.group.parent.remove(p.group);
    p.group.traverse(function(o){ if(o.geometry) o.geometry.dispose(); }); });
  patients = [];
  Object.keys(patientMats).forEach(function(k){ patientMats[k].dispose(); });
  patientMats = {};
}
function buildPatients(info, n){
  clearPatients();
  if(!n || !hunter.group) return;
  var g = world.grid, field = info.field;
  // 置き場所は間取りから作った別の乱数で引く（ゲームの rnd を引くと展開が変わる）
  var br = mulberry32(((info.reach.length * 2246822519) ^ (info.start.x * 3266489917) ^ (info.start.y * 668265263)) >>> 0 || 3);
  var cand = info.reach.filter(function(c){
    if(field[idx(c.x, c.y)] < 9) return false;                         // 開始地点の近くには置かない
    if(world.nav && world.nav[idx(c.x, c.y)] !== 0) return false;
    var walls = 0;
    for(var k=0; k<4; k++){ var nx = c.x + [1,-1,0,0][k], ny = c.y + [0,0,1,-1][k];
      if(!inBounds(nx, ny) || g[idx(nx, ny)] !== 0) walls++; }
    return walls >= 2;                                                   // 行き止まりや曲がり角の壁際
  });
  var fig = bakeFigure(hunter.group);
  var usedP = {};
  for(var i=0; i<n && cand.length; i++){
    var c = cand.splice((br() * cand.length) | 0, 1)[0];
    var key = c.x + ',' + c.y; if(usedP[key]) continue; usedP[key] = 1;
    // 壁のある向きを探し、そちらへ向けて壁際に立たせる
    var dirs = [];
    for(var k2=0; k2<4; k2++){ var wx = c.x + [1,-1,0,0][k2], wy = c.y + [0,0,1,-1][k2];
      if(!inBounds(wx, wy) || g[idx(wx, wy)] !== 0) dirs.push(k2); }
    var dk = dirs[(br() * dirs.length) | 0];
    var ddx = [1,-1,0,0][dk], ddz = [0,0,1,-1][dk];
    var w = cellToWorld(c.x, c.y);
    var px = w.x + ddx * (CELL*0.5 - 0.55), pz = w.z + ddz * (CELL*0.5 - 0.55);
    // 追跡者の前は -Z ではなく +Z 向き（yaw=atan2(dx,dz)）で組んである
    var yaw0 = Math.atan2(ddx, ddz);
    var grp = new THREE.Group();
    fig.children.forEach(function(m){ grp.add(new THREE.Mesh(m.geometry.clone(), m.material)); });
    grp.position.set(px, 0, pz);
    grp.rotation.y = yaw0;
    grp.scale.setScalar(0.93 + br()*0.05);
    scene.add(grp);
    patients.push({ group:grp, x:px, z:pz, yaw0:yaw0, yaw:yaw0, state:'idle', t:0, cool:0, ph:br()*TAU });
  }
  fig.children.forEach(function(m){ m.geometry.dispose(); });
}
function updatePatients(dt){
  for(var i=0; i<patients.length; i++){
    var p = patients[i];
    var dx = player.x - p.x, dz = player.z - p.z, d = Math.sqrt(dx*dx + dz*dz);
    // 触れられるほど寄っても、すり抜けはしない
    if(d < 0.42 && d > 0.0001 && !player.hiding){
      player.x = p.x + dx/d*0.42; player.z = p.z + dz/d*0.42;
    }
    p.cool = Math.max(0, p.cool - dt);
    p.t += dt;
    var face = Math.atan2(dx, dz);
    if(p.state === 'idle'){
      p.yaw = p.yaw0;
      if(p.cool <= 0 && d < PATIENT_NOTICE && !player.hiding && !cheats.invisible &&
         hasSight(world.grid, player.x, player.z, p.x, p.z)){
        var fx = -Math.sin(player.viewYaw), fz = -Math.cos(player.viewYaw);
        var lit = player.lamp && ((-dx/d)*fx + (-dz/d)*fz) > 0.93;         // 灯りを顔に向けた
        if(lit || (player.running && d < 3.2) || d < 1.4){ p.state = 'turn'; p.t = 0; }
      }
    }else if(p.state === 'turn'){
      p.yaw = lerpAngle(p.yaw0, face, clamp(p.t / 0.35, 0, 1));
      if(p.t >= 0.35){
        p.state = 'stare'; p.t = 0; p.cool = PATIENT_COOL;
        var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
        Audio2.shriek(d, clamp(((p.x-player.x)*rx + (p.z-player.z)*rz) / Math.max(1, d), -1, 1));
        player.sanity = clamp(player.sanity - 8, 0, 100);
        player.shake = Math.max(player.shake, 0.5);
        haptic(60);
        // 叫び声のした場所へ呼ぶ。見て追っている最中なら何も変わらない
        if(!cheats.invisible && hunter.spawnGrace <= 0 && hunter.mode !== 'chase'){
          hunter.mode = 'hunt'; hunter.lastSeen = { x:p.x, z:p.z }; hunter.repathT = 0; hunter.inspect = null;
        }
        if(settings.cues) soundCue('叫び声', d, true);
      }
    }else if(p.state === 'stare'){
      p.yaw = lerpAngle(p.yaw, face, 1 - Math.pow(0.02, dt));
      if(p.t >= PATIENT_STARE){ p.state = 'back'; p.t = 0; p.from = p.yaw; }
    }else if(p.state === 'back'){
      p.yaw = lerpAngle(p.from, p.yaw0, clamp(p.t / 1.4, 0, 1));
      if(p.t >= 1.4) p.state = 'idle';
    }
    // 揺れ。立ったまま、わずかに前後へ
    p.group.rotation.set(Math.sin(p.t*0.6 + p.ph)*0.025, p.yaw, Math.sin(p.t*0.43 + p.ph)*0.018);
  }
}
function lerpAngle(a, b, t){
  var dd = ((b - a + Math.PI*3) % TAU) - Math.PI;
  return a + dd * t;
}

/* --- 通気口（設計指示書 第 5.4 節・第4章） ---------------------------------
   天井近くの格子から天井裏へ入り、音のした場所の近くの格子から降りてくる。
   入っている間は姿も目も無い（見られないし、襲ってもこない）。
   代わりに天井裏を這う金属の音が、上から、動いていく方向に鳴る。
   降りる直前にいちばん大きく鳴るので、耳を澄ませていれば先回りに気づける。 */
var vents = [];
var VENT_CD = 35;            // 一度使ったら、次に使えるまで
var VENT_SPEED = 6.5;        // 天井裏を進む速さ（m/s）
function clearVents(){
  vents.forEach(function(v){ if(v.mesh.parent) v.mesh.parent.remove(v.mesh); v.mesh.geometry.dispose(); });
  vents = [];
}
var ventGeo = null, ventMat = null;
function buildVents(info, n){
  clearVents();
  hunter.vent = null; hunter.ventT = 0; hunter.ventCd = 8;
  if(!n) return;
  if(!ventGeo){
    var parts = [{ w:0.95, h:0.52, d:0.05, y:0, c:0x3a3f3c }];            // 枠
    for(var k=0; k<5; k++) parts.push({ w:0.86, h:0.035, d:0.07, y:-0.19 + k*0.095, c:0x7b8079 });   // 羽板
    ventGeo = mergeTinted(parts);
    ventMat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:0.55, metalness:0.6,
                                               map:TEX.grunge || null });
  }
  var g = world.grid;
  var br = mulberry32(((info.reach.length * 374761393) ^ (info.start.x * 2654435761) ^ (info.start.y * 97)) >>> 0 || 5);
  var cand = info.reach.filter(function(c){
    if(world.nav && world.nav[idx(c.x, c.y)] !== 0) return false;
    for(var k=0; k<4; k++){ var nx = c.x + [1,-1,0,0][k], ny = c.y + [0,0,1,-1][k];
      if(!inBounds(nx, ny) || g[idx(nx, ny)] !== 0) return true; }
    return false;
  });
  for(var i=0; i<n && cand.length; i++){
    var c = cand.splice((br() * cand.length) | 0, 1)[0];
    // 近すぎる格子は置かない（天井裏の近道にならない）
    var near = vents.some(function(v){ return Math.abs(v.cx - c.x) + Math.abs(v.cy - c.y) < 5; });
    if(near){ i--; if(!cand.length) break; continue; }
    var dirs = [];
    for(var k2=0; k2<4; k2++){ var wx = c.x + [1,-1,0,0][k2], wy = c.y + [0,0,1,-1][k2];
      if(!inBounds(wx, wy) || g[idx(wx, wy)] !== 0) dirs.push(k2); }
    var dk = dirs[(br() * dirs.length) | 0], ddx = [1,-1,0,0][dk], ddz = [0,0,1,-1][dk];
    var w = cellToWorld(c.x, c.y);
    var m = new THREE.Mesh(ventGeo, ventMat);
    m.position.set(w.x + ddx*(CELL*0.5 - 0.04), WALL_H - 0.55, w.z + ddz*(CELL*0.5 - 0.04));
    m.rotation.y = Math.atan2(ddx, ddz);
    world.group.add(m);
    vents.push({ mesh:m, x:w.x, z:w.z, cx:c.x, cy:c.y });
  }
}
function nearestVent(x, z, maxD, not){
  var best = null, bd = maxD;
  for(var i=0; i<vents.length; i++){
    if(vents[i] === not) continue;
    var dx = vents[i].x - x, dz = vents[i].z - z, dd = Math.sqrt(dx*dx + dz*dz);
    if(dd < bd){ bd = dd; best = vents[i]; }
  }
  return best;
}
/* 天井裏に入るか。捜索中（hunt）で、行き先が遠く、近くに入口があり、
   行き先の近くに出口があるときだけ */
function ventTryEnter(){
  if(!vents.length || hunter.ventCd > 0 || hunter.mode !== 'hunt' || !hunter.lastSeen || cheats.freeze) return false;
  var L = hunter.lastSeen;
  var far = Math.sqrt((L.x-hunter.x)*(L.x-hunter.x) + (L.z-hunter.z)*(L.z-hunter.z));
  if(far < 18) return false;
  var vIn = nearestVent(hunter.x, hunter.z, 7, null);
  var vOut = vIn && nearestVent(L.x, L.z, 9, vIn);
  if(!vIn || !vOut) return false;
  var span = Math.sqrt((vOut.x-vIn.x)*(vOut.x-vIn.x) + (vOut.z-vIn.z)*(vOut.z-vIn.z));
  if(span < 12) return false;
  hunter.vent = { from:vIn, to:vOut, T:clamp(span / VENT_SPEED, 2.5, 7), bangT:0, warned:false };
  hunter.ventT = hunter.vent.T;
  hunter.group.visible = false; hunter.shadow.visible = false;
  ventBang(vIn.x, vIn.z, 1.0);
  return true;
}
/* 天井裏を進む。戻り値 true の間は、追跡者の他の処理を全部止める */
function ventUpdate(dt){
  if(!hunter.vent) return false;
  var V = hunter.vent;
  hunter.ventT -= dt;
  var k = clamp(1 - hunter.ventT / V.T, 0, 1);
  var x = lerp(V.from.x, V.to.x, k), z = lerp(V.from.z, V.to.z, k);
  V.bangT -= dt;
  if(V.bangT <= 0){ V.bangT = 0.42 + Math.random()*0.18; ventBang(x, z, 0.45); }
  if(!V.warned && hunter.ventT < 1.2){
    V.warned = true; ventBang(V.to.x, V.to.z, 1.2);
    var pd = Math.sqrt((V.to.x-player.x)*(V.to.x-player.x) + (V.to.z-player.z)*(V.to.z-player.z));
    if(settings.cues && pd < 18) soundCue('天井裏', pd, true);
  }
  if(hunter.ventT > 0) return true;
  // 降りる
  var p = pushOutOfWalls(V.to.x, V.to.z, 0.34);
  hunter.x = p.x; hunter.z = p.z;
  hunter.group.visible = true; hunter.shadow.visible = true;
  hunter.stunT = Math.max(hunter.stunT, 0.6);          // 着地のひと呼吸
  hunter.target = null; hunter.repathT = 0;
  hunter.vent = null; hunter.ventCd = VENT_CD;
  haptic(40);
  return false;
}
function ventBang(x, z, loud){
  var dx = x - player.x, dz = z - player.z, d = Math.sqrt(dx*dx + dz*dz);
  var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  Audio2.clang(d, clamp((dx*rx + dz*rz) / Math.max(1, d), -1, 1), loud);
}

/* --- 映るもの（設計指示書 第 5.4 節・第5章） -------------------------------
   灯りを消している間だけ近づいてくる。体は黒く、自分では光らないので、
   ランプの光の中でしか見えない。照らされると止まり、照らされ続けると消える。
   触れられると、捕まったのと同じだけ削られる。
   柱 1「光は命綱であり、罠である」を、あれとは逆向きに突きつける：
   あれから隠れるには灯りを消したいが、消せばこちらが寄ってくる。 */
var shade = { group:null, on:false, x:0, z:0, darkT:0, litT:0, cool:0, whisperT:0 };
/* 3 秒・1.4 m/s では第5章の通常が 18.3%（被弾 0.89 /100 秒。ボット 240 本）と
   ほかの章の半分に落ちた。消している時間を少し長く許し、足を遅くした */
var SHADE_SPEED = 1.2;        // 歩き（3.1 m/s）の半分より遅い
var SHADE_WAIT = 5.0;         // 灯りを消してから現れるまで
var SHADE_LIT = 1.2;          // これだけ照らし続けると消える
var shadeMat = null;
function buildShade(on){
  if(shade.group){ if(shade.group.parent) shade.group.parent.remove(shade.group);
    shade.group.traverse(function(o){ if(o.geometry) o.geometry.dispose(); }); shade.group = null; }
  shade.enabled = !!on; shade.on = false; shade.darkT = 0; shade.litT = 0; shade.cool = 6; shade.whisperT = 0;
  if(!on || !hunter.group) return;
  if(!shadeMat) shadeMat = new THREE.MeshLambertMaterial({ color:0x5a5c60 });
  var fig = bakeFigure(hunter.group);
  shade.group = new THREE.Group();
  fig.children.forEach(function(m){ shade.group.add(new THREE.Mesh(m.geometry, shadeMat)); });
  shade.group.visible = false;
  shade.group.scale.set(0.96, 1.04, 0.96);                    // 少しだけ縦に長い
  scene.add(shade.group);
}
function shadeSpawn(){
  // 通路の道のりで 12〜18m 離れた、こちらから見えていないマスに現れる
  var F = PATHF.field; if(!F) return false;
  var list = [];
  for(var i=0; i<F.length; i++){
    var dv = F[i] * CELL;
    if(F[i] > 0 && dv >= 12 && dv <= 18){
      var cx = i % GW, cy = (i / GW) | 0, w = cellToWorld(cx, cy);
      if(!hasSight(world.grid, player.x, player.z, w.x, w.z)) list.push(w);
    }
  }
  if(!list.length) return false;
  var w2 = list[(Math.random() * list.length) | 0];          // 見た目だけの出来事なので rnd は引かない
  shade.x = w2.x; shade.z = w2.z; shade.on = true; shade.litT = 0;
  shade.group.visible = true;
  return true;
}
function updateShade(dt){
  if(!shade.enabled || !shade.group) return;
  if(shade.cool > 0) shade.cool -= dt;
  var dark = !player.lamp && !player.hiding;
  shade.darkT = dark ? shade.darkT + dt : 0;
  if(!shade.on){
    if(shade.cool <= 0 && shade.darkT > SHADE_WAIT && !cheats.invisible) shadeSpawn();
    return;
  }
  var dx = player.x - shade.x, dz = player.z - shade.z, d = Math.sqrt(dx*dx + dz*dz);
  // 照らされているか：ランプが点いていて、光の円錐に入っていて、壁に遮られていない
  var lit = false;
  if(player.lamp && d < 16){
    var fx = -Math.sin(player.viewYaw), fz = -Math.cos(player.viewYaw);
    lit = ((-dx/d)*fx + (-dz/d)*fz) > 0.88 && hasSight(world.grid, player.x, player.z, shade.x, shade.z);
  }
  if(lit){
    shade.litT += dt;
    if(shade.litT >= SHADE_LIT){ shade.on = false; shade.group.visible = false; shade.cool = 12; Audio2.gasp(); }
  }else{
    shade.litT = Math.max(0, shade.litT - dt*0.5);
    // 灯りの外にいる間だけ進む。道のりの地図を 1 マスずつ降りる
    if(!player.lamp || !lit){
      var c = worldToCell(shade.x, shade.z), F = PATHF.field, tx = player.x, tz = player.z;
      if(F && inBounds(c.x, c.y) && F[idx(c.x, c.y)] > 1){
        var cur = F[idx(c.x, c.y)];
        /** @type {{x:number, z:number}|null} */
        var best = null;
        [[1,0],[-1,0],[0,1],[0,-1]].forEach(function(o){
          var nx = c.x + o[0], ny = c.y + o[1];
          if(inBounds(nx, ny) && F[idx(nx, ny)] >= 0 && F[idx(nx, ny)] < cur) best = cellToWorld(nx, ny);
        });
        if(best){ tx = best.x; tz = best.z; }
      }
      var mx = tx - shade.x, mz = tz - shade.z, ml = Math.sqrt(mx*mx + mz*mz) || 1;
      var st = Math.min(ml, SHADE_SPEED * dt * (player.lamp ? 0.5 : 1));
      shade.x += mx/ml*st; shade.z += mz/ml*st;
    }
  }
  // 囁き。近いほど頻繁に、耳元で
  shade.whisperT -= dt;
  if(d < 9 && shade.whisperT <= 0){
    shade.whisperT = 0.9 + d*0.25;
    var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
    Audio2.whisper(d, clamp(((shade.x-player.x)*rx + (shade.z-player.z)*rz) / Math.max(1, d), -1, 1));
    if(settings.cues) soundCue('囁き', d, d < 4);
  }
  shade.group.position.set(shade.x, 0, shade.z);
  shade.group.rotation.y = Math.atan2(dx, dz);
  // 触れられた
  if(d < 0.9 && !player.hiding){
    shade.on = false; shade.group.visible = false; shade.cool = 25;
    player.sanity = clamp(player.sanity - 40, 0, 100);
    player.shake = 1.2; player.hurtT = 0.5;
    if(!cheats.godmode) player.hp = clamp(player.hp - DIFF[settings.diff].dmg, 0, 100);
    player.hits = (player.hits || 0) + 1;
    player.lastHitBy = 'shade';
    tele('touch', { x:+player.x.toFixed(1), z:+player.z.toFixed(1) });
    Audio2.hurt(); haptic([80, 40, 120]);
    toast(escapesLeft() > 0 ? '冷たい指が触れた（あと ' + escapesLeft() + ' 回）' : '冷たい指が触れた', 2.6);
    if(player.hp <= 0) doDeath();
  }
}

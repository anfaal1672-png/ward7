/* =========================================================================
   3. 手続きテクスチャ生成
   ========================================================================= */
function makeCanvas(/** @type {any} */ s){
  var c = document.createElement('canvas'); c.width = c.height = s; return c;
}
function valueNoise(/** @type {any} */ ctx2, /** @type {any} */ s, /** @type {any} */ cell, /** @type {any} */ alpha){
  var n = Math.ceil(s/cell);
  for(var y=0;y<n;y++) for(var x=0;x<n;x++){
    var v = Math.floor(rnd()*255);
    ctx2.fillStyle = 'rgba('+v+','+v+','+v+','+alpha+')';
    ctx2.fillRect(x*cell, y*cell, cell, cell);
  }
}
function texWall(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#3a4140'; g.fillRect(0,0,size,size);
  /* タイルの目地。
     4×4 で割っていたので、壁 1 面（4.2m×3.6m）に対して 1 マスが約 1m。
     そこへ ±14% の明暗を振っていたため、壁が「大きな斑の迷彩」に見えて
     いた。病棟の壁タイルは 15〜30cm なので 12×12（約 35cm）にする。
     ばらつきも ±6% まで落とし、代わりに数枚だけ大きく汚れた札を混ぜる
     ——全部が均一に汚いより、たまに極端に汚いほうが古く見える。 */
  var N = 12, tile = size/N, gap = Math.max(1, size/512*2);
  for(var y=0;y<N;y++) for(var x=0;x<N;x++){
    var sh = 0.94 + rnd()*0.12;
    // 20枚に1枚くらい、目立って汚れた／欠けたタイル
    if(rnd() < 0.05) sh *= 0.66 + rnd()*0.16;
    /* タイルの地色。88,95,92 は線形で 0.10——アスファルトなみの反射率で、
       病棟の白タイルとしては暗すぎた。これまでは塗装の剥がれの淡い斑が
       全体を持ち上げていて、その斑を小さくした途端に壁が沈んだ。
       124,132,126（線形 0.21）にする。汚れているので白では無い。 */
    var r = Math.floor(124*sh), gg = Math.floor(132*sh), b = Math.floor(126*sh);
    g.fillStyle = 'rgb('+r+','+gg+','+b+')';
    g.fillRect(x*tile+gap, y*tile+gap, tile-gap*2, tile-gap*2);
    // 目地側の面取り。上と左を少し明るくすると 1 枚 1 枚が浮き上がる
    g.fillStyle = 'rgba(196,200,192,0.10)';
    g.fillRect(x*tile+gap, y*tile+gap, tile-gap*2, Math.max(1, gap*0.8));
    g.fillRect(x*tile+gap, y*tile+gap, Math.max(1, gap*0.8), tile-gap*2);
  }
  /* 汚れの数は解像度に比例させる。
     これまで枚数が固定だったので、1024 で焼くと同じ 180 個の染みが
     引き伸ばされるだけで、高精細にしても「大きくぼやけた壁」になっていた。
     面積比で増やすと、寄っても離れても密度が変わらない。 */
  var K = (size/256) * (size/256);
  /* 汚れの形。真円の斑を撒いていたので、壁が迷彩柄に見えていた。
     壁に付く汚れは重力で必ず下へ伸びる——水が垂れ、埃が流れ、
     手で触った跡が下へこすれる。縦に 1.6〜3.4 倍伸ばし、
     濃さの中心も上へ寄せて、下へ抜けるようにする。 */
  for(var i=0;i<Math.round(180*K);i++){
    var px = rnd()*size, py = rnd()*size;
    var rr = rnd()*size*0.10*(0.5+0.5/Math.sqrt(K));
    var el = 1.6 + rnd()*1.8;                    // 縦の伸び
    var a = rnd()*0.17;
    g.save();
    g.translate(px, py); g.scale(1, el);
    var grad = g.createRadialGradient(0,-rr*0.35,0, 0,-rr*0.35,rr);
    grad.addColorStop(0,'rgba(30,26,20,'+a+')');
    grad.addColorStop(1,'rgba(30,26,20,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(0,-rr*0.35,rr,0,TAU); g.fill();
    g.restore();
  }
  /* 目地に溜まる汚れ。タイルの面は拭けても、目地は落ちない。
     ここが均一だと「模様を印刷した板」に見える。線ごとに濃さを変える。 */
  for(var gy=0; gy<=N; gy++){
    g.fillStyle = 'rgba(26,24,20,' + (0.10 + rnd()*0.26).toFixed(2) + ')';
    g.fillRect(0, gy*tile - gap*0.5, size, gap*1.6);
  }
  for(var gx=0; gx<=N; gx++){
    g.fillStyle = 'rgba(26,24,20,' + (0.06 + rnd()*0.18).toFixed(2) + ')';
    g.fillRect(gx*tile - gap*0.5, 0, gap*1.6, size);
  }
  // 錆の垂れ
  for(var j=0;j<Math.round(10*Math.sqrt(K));j++){
    var sx = rnd()*size, w = (1+rnd()*3)*Math.sqrt(K), h = size*(0.2+rnd()*0.6);
    var lg = g.createLinearGradient(0,0,0,h);
    lg.addColorStop(0,'rgba(96,52,30,0.30)');
    lg.addColorStop(1,'rgba(96,52,30,0)');
    g.fillStyle = lg; g.save(); g.translate(sx, rnd()*size*0.4); g.fillRect(0,0,w,h); g.restore();
  }
  /* ひび割れと剥がれ。細い線なので、低解像度で入れると
     ただのノイズに潰れる。512 以上でだけ描く。 */
  if(size >= 512){
    g.lineCap = 'round';
    for(var ck=0; ck<Math.round(7*Math.sqrt(K)); ck++){
      var cx = rnd()*size, cy = rnd()*size;
      var ang = rnd()*TAU, seg = 3 + (rnd()*5|0);
      g.strokeStyle = 'rgba(22,20,18,' + (0.18 + rnd()*0.22) + ')';
      g.lineWidth = 0.8 + rnd()*1.6;
      g.beginPath(); g.moveTo(cx, cy);
      for(var sgi=0; sgi<seg; sgi++){
        ang += (rnd()-0.5)*1.1;
        cx += Math.cos(ang) * size*0.035; cy += Math.sin(ang) * size*0.035;
        g.lineTo(cx, cy);
      }
      g.stroke();
      // ひびの片側だけ明るい。凹んで影が落ちているように見える
      g.strokeStyle = 'rgba(150,150,140,0.10)';
      g.lineWidth = 0.7; g.stroke();
    }
    /* 塗装の剥がれ。下地のモルタルが覗く不定形の面。
       半径をテクスチャの 1.2〜4.7% で描いていたので、壁の上では
       20〜50cm の大きな淡い斑になり、しかも地の色より明るかった。
       離れて見ると迷彩柄にしか見えない（実際そう見えていた）。
       剥がれは塗膜が浮いて欠ける現象なので、実物は数 cm。
       小さく・地より暗く・縁に影を付ける。 */
    for(var pl=0; pl<Math.round(9*K); pl++){
      var ox = rnd()*size, oy = rnd()*size, rad = size*(0.005 + rnd()*0.013);
      g.beginPath();
      for(var pa=0; pa<8; pa++){
        var aa = pa/8*TAU, rr2 = rad*(0.6 + rnd()*0.8);
        var xx = ox + Math.cos(aa)*rr2, yy = oy + Math.sin(aa)*rr2;
        if(pa === 0) g.moveTo(xx, yy); else g.lineTo(xx, yy);
      }
      g.closePath();
      g.fillStyle = 'rgba(70,72,68,' + (0.28 + rnd()*0.26).toFixed(2) + ')';
      g.fill();
      // 欠けた縁は塗膜の厚みぶん影になる
      g.strokeStyle = 'rgba(30,30,28,0.30)';
      g.lineWidth = Math.max(1, size/700);
      g.stroke();
    }
  }
  g.globalAlpha = 0.05; valueNoise(g, size, 2, 1); g.globalAlpha = 1;
  return c;
}
function texFloor(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#2d3231'; g.fillRect(0,0,size,size);
  /* 床タイル。2×2 で割っていたので 1 枚が 2.1m 角もあり、
     しかも ±20% 明暗を振っていたので、床が大きな市松模様に見えていた。
     長尺シートを想定して 6×6（70cm）にする。継ぎ目は目地ではなく
     溶接線なので、明るい線ではなく細い暗線で入れる。 */
  var NF = 6, tileF = size/NF;
  for(var y=0;y<NF;y++) for(var x=0;x<NF;x++){
    var sh = 0.93 + rnd()*0.14;
    if(rnd() < 0.06) sh *= 0.78 + rnd()*0.12;      // 何枚かは剥がれて黒ずんでいる
    /* 床の地色。52,56,54 は線形で 0.037——アスファルト並みの反射率で、
       どれだけ光を当てても黒いままだった。手前の床は画面の 3 割を占める
       のに、そこが常に真っ黒で奥行きの手がかりが無かった。
       擦り切れた長尺シートの実測に近い 0.11 前後（92,97,94）にする。 */
    g.fillStyle = 'rgb('+Math.floor(92*sh)+','+Math.floor(97*sh)+','+Math.floor(94*sh)+')';
    g.fillRect(x*tileF, y*tileF, tileF, tileF);
    g.strokeStyle = 'rgba(14,16,15,0.55)';
    g.lineWidth = Math.max(1, size/512);
    g.strokeRect(x*tileF, y*tileF, tileF, tileF);
  }
  var KF = (size/256) * (size/256);
  for(var i=0;i<Math.round(120*KF);i++){
    var px=rnd()*size, py=rnd()*size, rr=rnd()*size*0.2*(0.5+0.5/Math.sqrt(KF));
    var grad=g.createRadialGradient(px,py,0,px,py,rr);
    grad.addColorStop(0,'rgba(16,14,12,'+(rnd()*0.25)+')');
    grad.addColorStop(1,'rgba(16,14,12,0)');
    g.fillStyle=grad; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  /* 擦り傷。人が何十年も同じ線を歩いた跡。
     床は視界のいちばん近くにあるので、ここの粗さが解像度の印象を決める。 */
  if(size >= 512){
    for(var sc=0; sc<Math.round(26*Math.sqrt(KF)); sc++){
      var ax = rnd()*size, ay = rnd()*size;
      var ar = size*(0.06 + rnd()*0.22), a0 = rnd()*TAU;
      g.strokeStyle = 'rgba(190,190,178,' + (0.03 + rnd()*0.05) + ')';
      g.lineWidth = 0.6 + rnd()*1.2;
      g.beginPath(); g.arc(ax, ay, ar, a0, a0 + 0.3 + rnd()*0.9); g.stroke();
    }
  }
  g.globalAlpha = 0.06; valueNoise(g, size, 2, 1); g.globalAlpha = 1;
  return c;
}
/* 追跡者の皮膚。
   ここだけが最後まで無地マテリアルのまま残っていて、他の面がすべて
   テクスチャ付きになった結果、掴まれる距離まで寄られたときに
   「のっぺりした人形」に見えて浮いていた。
   斑（血の通っている所と引いている所）・皮下の静脈・古い痣を重ねる。 */
function texFlesh(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  /* 地色。以前は #9ea394（62%グレー）で、懐中電灯を当てると壁より明るく
     返ってきて真っ白な人形に見えていた。実測で 壁の 1.6 倍。
     暗がりで白く光る化け物ではなく、光を当ててやっと形が分かる程度に落とす。 */
  g.fillStyle = '#5c6155'; g.fillRect(0,0,size,size);
  var K = (size/256) * (size/256);
  /* 斑。以前は不透明度 0.10〜0.26 しか無く、変化が地色の ±10% に収まって
     いた。至近距離で撮ってみると、模様があるはずの体が完全な無地に
     見える。画面上の差が 170 階調に対して 10 階調しかなければ当然で、
     「テクスチャは貼ってあるのに肌に見えない」状態だった。
     大きな斑・中くらいの斑・鬱血、と 3 段階に分けて濃さも上げる。 */
  /** @type {Array<Array<any>>} */
  var blobs = [
    // 半径の範囲, 個数, 色, 濃さの範囲
    [0.10, 0.26, 22, '104,110,96',  0.22, 0.34],   // 大きな明暗のうねり（暗い側）
    [0.08, 0.20, 18, '178,182,164', 0.20, 0.30],   // 血の引いた青白い所
    [0.03, 0.11, 46, '146,104,92',  0.18, 0.34],   // 鬱血して赤黒い所
    [0.02, 0.06, 40, '74,78,66',    0.16, 0.30]    // 落ちくぼんだ影
  ];
  for(var bi=0; bi<blobs.length; bi++){
    var B = blobs[bi], cnt = Math.round(B[2]*K);
    for(var i=0;i<cnt;i++){
      var px = rnd()*size, py = rnd()*size;
      var rr = size*(B[0] + rnd()*(B[1]-B[0]));
      var gr = g.createRadialGradient(px,py,0,px,py,rr);
      var al = B[4] + rnd()*(B[5]-B[4]);
      gr.addColorStop(0, 'rgba('+B[3]+','+al.toFixed(3)+')');
      gr.addColorStop(0.55, 'rgba('+B[3]+','+(al*0.45).toFixed(3)+')');
      gr.addColorStop(1, 'rgba('+B[3]+',0)');
      g.fillStyle = gr; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
    }
  }
  // 皮下の静脈と古い痣。細部なので低解像度では焼かない（潰れて汚れに見える）
  if(size >= 256){
    g.lineCap = 'round';
    for(var v=0;v<Math.round(26*K);v++){
      var vx = rnd()*size, vy = rnd()*size, a = rnd()*TAU;
      var seg = 4 + Math.floor(rnd()*5), wdt = size*(0.004 + rnd()*0.006);
      // 濃さを上げた。0.10〜0.20 では画面上でただの汚れにしか見えない
      g.strokeStyle = 'rgba(58,70,92,'+(0.22+rnd()*0.20).toFixed(3)+')';
      for(var s2=0;s2<seg;s2++){
        var len = size*(0.02 + rnd()*0.05);
        var nx = vx + Math.cos(a)*len, ny = vy + Math.sin(a)*len;
        g.lineWidth = wdt*(1 - s2/(seg+1));
        g.beginPath(); g.moveTo(vx,vy); g.lineTo(nx,ny); g.stroke();
        vx = nx; vy = ny; a += (rnd()*2-1)*0.7;
      }
    }
    for(var b=0;b<Math.round(14*K);b++){
      var bx = rnd()*size, by = rnd()*size, br = size*(0.02 + rnd()*0.06);
      var bg = g.createRadialGradient(bx,by,0,bx,by,br);
      bg.addColorStop(0, 'rgba(72,52,74,0.40)');
      bg.addColorStop(0.6, 'rgba(96,80,62,0.22)');
      bg.addColorStop(1, 'rgba(96,80,62,0)');
      g.fillStyle = bg; g.beginPath(); g.arc(bx,by,br,0,TAU); g.fill();
    }
    // 乾いて浮いた皮。細い横線を散らすと、寄ったときに面が生きる
    for(var fl=0; fl<Math.round(30*K); fl++){
      var fx = rnd()*size, fy = rnd()*size, fw = size*(0.01 + rnd()*0.03);
      g.strokeStyle = 'rgba(196,196,178,'+(0.10+rnd()*0.14).toFixed(3)+')';
      g.lineWidth = Math.max(1, size*0.0022);
      g.beginPath(); g.moveTo(fx,fy);
      g.lineTo(fx + fw*(rnd()*0.6+0.7), fy + (rnd()-0.5)*size*0.006);
      g.stroke();
    }
  }
  g.globalAlpha = 0.16; valueNoise(g, size, 2, 1); g.globalAlpha = 1;
  return c;
}

/* 壁に残る痕跡。
   壁が均一に汚れているだけで、「ここで何かがあった」場所が 1 つも無かった。
   血の跡・手形・爪痕・水染みを 2x2 の 1 枚にまとめて焼き、壁面に貼る。
   4 種類あれば、同じ模様が並んで見えるほどには繰り返さない。

   透明度を持つので、色は白のまま alpha で抜く（材質側で色を掛ける）。 */
function texDecals(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  var h = size/2;
  g.clearRect(0,0,size,size);

  // (0,0) 血の飛沫と垂れ
  g.save(); g.beginPath(); g.rect(0,0,h,h); g.clip();
  for(var i=0;i<26;i++){
    var bx = h*0.5 + (rnd()-0.5)*h*0.62, by = h*0.34 + (rnd()-0.5)*h*0.40;
    var br = h*(0.012 + rnd()*0.055);
    g.fillStyle = 'rgba(96,14,10,'+(0.42+rnd()*0.45).toFixed(2)+')';
    g.beginPath(); g.ellipse(bx, by, br, br*(0.7+rnd()*0.7), rnd()*TAU, 0, TAU); g.fill();
    if(rnd() < 0.45){
      /* 垂れ。長方形で塗ると上端が四角く残って「貼った跡」に見える。
         先を絞った形にして、下端は透明へ抜く。 */
      var dl = h*(0.06 + rnd()*0.30), dw2 = br*0.34;
      var lg = g.createLinearGradient(0, by, 0, by+dl);
      lg.addColorStop(0,'rgba(96,14,10,0.75)'); lg.addColorStop(1,'rgba(96,14,10,0)');
      g.fillStyle = lg;
      g.beginPath();
      g.moveTo(bx-dw2, by);
      g.quadraticCurveTo(bx-dw2*0.5, by+dl*0.7, bx, by+dl);
      g.quadraticCurveTo(bx+dw2*0.5, by+dl*0.7, bx+dw2, by);
      g.closePath(); g.fill();
    }
  }
  g.restore();

  // (1,0) 手形。指 4 本＋親指＋手のひら
  g.save(); g.translate(h,0); g.beginPath(); g.rect(0,0,h,h); g.clip();
  /* 手のひらは縦長の楕円ではなく横に広い。指は手のひらの中から生やして
     根元を重ねないと、玉が浮いた「肉球」に見える。 */
  g.fillStyle = 'rgba(78,16,12,0.60)';
  g.beginPath(); g.ellipse(h*0.50, h*0.60, h*0.165, h*0.145, 0, 0, TAU); g.fill();
  for(var f=0; f<4; f++){
    var fx = h*(0.355 + f*0.097);
    var flen = h*(0.150 - Math.abs(f-1.35)*0.020);
    var ftip = h*0.60 - h*0.10 - flen;
    g.beginPath();
    g.ellipse(fx, (h*0.60 - h*0.06 + ftip)/2 + h*0.02, h*0.034, (h*0.60 - ftip)*0.42,
              (f-1.5)*0.10, 0, TAU);
    g.fill();
  }
  // 親指は手のひらの外側やや下から
  g.save(); g.translate(h*0.30, h*0.66); g.rotate(0.85);
  g.beginPath(); g.ellipse(0, 0, h*0.042, h*0.105, 0, 0, TAU); g.fill(); g.restore();
  // 引きずった尾。長方形をやめて手のひらから細く抜く
  var hg = g.createLinearGradient(h*0.5, h*0.70, h*0.5, h*0.97);
  hg.addColorStop(0,'rgba(78,16,12,0.40)'); hg.addColorStop(1,'rgba(78,16,12,0)');
  g.fillStyle = hg;
  g.beginPath();
  g.moveTo(h*0.35, h*0.70);
  g.quadraticCurveTo(h*0.42, h*0.90, h*0.47, h*0.97);
  g.lineTo(h*0.55, h*0.97);
  g.quadraticCurveTo(h*0.60, h*0.90, h*0.65, h*0.70);
  g.closePath(); g.fill();
  g.restore();

  // (0,1) 爪痕。3〜4 本の平行な引っ掻き
  g.save(); g.translate(0,h); g.beginPath(); g.rect(0,0,h,h); g.clip();
  g.lineCap = 'round';
  var a0 = -0.35 + rnd()*0.7;
  for(var k=0;k<4;k++){
    var ox = h*(0.22 + k*0.13), w2 = h*(0.010 + rnd()*0.012);
    g.strokeStyle = 'rgba(26,18,14,'+(0.44+rnd()*0.30).toFixed(2)+')';
    g.lineWidth = w2;
    g.beginPath();
    g.moveTo(ox, h*0.16);
    g.quadraticCurveTo(ox + Math.sin(a0)*h*0.10, h*0.50, ox + Math.sin(a0)*h*0.22, h*0.86);
    g.stroke();
    // 縁の白い削れ
    g.strokeStyle = 'rgba(214,210,196,0.20)'; g.lineWidth = w2*0.45;
    g.beginPath();
    g.moveTo(ox - w2*0.6, h*0.16);
    g.quadraticCurveTo(ox - w2*0.6 + Math.sin(a0)*h*0.10, h*0.50, ox - w2*0.6 + Math.sin(a0)*h*0.22, h*0.86);
    g.stroke();
  }
  g.restore();

  // (1,1) 水染み。上から広がって下端がぼやける
  g.save(); g.translate(h,h); g.beginPath(); g.rect(0,0,h,h); g.clip();
  for(var w3=0; w3<7; w3++){
    var wx = h*(0.30 + rnd()*0.40), wy = h*(0.10 + rnd()*0.35);
    var wr = h*(0.10 + rnd()*0.22);
    var wgd = g.createRadialGradient(wx, wy, 0, wx, wy, wr);
    wgd.addColorStop(0,'rgba(58,52,34,'+(0.16+rnd()*0.16).toFixed(2)+')');
    wgd.addColorStop(0.7,'rgba(58,52,34,0.06)');
    wgd.addColorStop(1,'rgba(58,52,34,0)');
    g.fillStyle = wgd; g.beginPath(); g.arc(wx, wy, wr, 0, TAU); g.fill();
  }
  /* 下へ落ちる筋。長方形で塗ると輪郭が四角く残るので、
     円を縦に重ねて幅を絞りながら降ろす。 */
  for(var ws=0; ws<14; ws++){
    var wt = ws/13;
    var wy2 = h*(0.22 + wt*0.70);
    var wr2 = h*(0.26 - wt*0.17);
    var wgd2 = g.createRadialGradient(h*0.50, wy2, 0, h*0.50, wy2, wr2);
    var wa = 0.10 * (1 - wt);
    wgd2.addColorStop(0,'rgba(48,42,28,'+wa.toFixed(3)+')');
    wgd2.addColorStop(1,'rgba(48,42,28,0)');
    g.fillStyle = wgd2; g.beginPath(); g.arc(h*0.50, wy2, wr2, 0, TAU); g.fill();
  }
  g.restore();
  return c;
}

/* 皮膚の粗さマップ。
   全面 roughness:1 だと、どこにもハイライトが乗らないので石膏像に見える。
   かといって一律に下げると全身がぬめって、汗ではなくビニールになる。

   肌の canvas から作るのが正しい。血の通っている（赤みの強い）所は
   熱を持って汗ばんでいる＝つやがある、引いている所は乾いて粗い。
   別々に乱数で撒くと色と照りの位置がずれて、いかにも二枚重ねに見える。
   three は緑成分を粗さとして読むので、そこにだけ値を入れる。 */
function texFleshRough(/** @type {any} */ fleshCanvas){
  var s = fleshCanvas.width;
  var src = fleshCanvas.getContext('2d').getImageData(0,0,s,s).data;
  var out = makeCanvas(s), og = out.getContext('2d');
  var img = og.createImageData(s,s), d = img.data;
  for(var i=0;i<s*s;i++){
    var r = src[i*4], gch = src[i*4+1], b = src[i*4+2];
    // 赤みの強さ。地色（158,163,148）を基準に、赤が緑を上回るほど大きい
    var warm = clamp((r - gch) / 42 + 0.12, 0, 1);
    // 青黒い痣も皮が張って光る。青が緑を上回る量を少しだけ足す
    var bruise = clamp((b - gch) / 60, 0, 1) * 0.5;
    var rough = 0.97 - 0.50*warm - 0.22*bruise;
    var v = Math.round(clamp(rough, 0, 1) * 255);
    d[i*4] = 0; d[i*4+1] = v; d[i*4+2] = 0; d[i*4+3] = 255;
  }
  og.putImageData(img,0,0);
  return out;
}
/* テクスチャの平均反射率（線形・チャンネルごと）。材質の色とテクスチャは
   掛け算になるので、最終的な反射率を知るにはテクスチャ側の平均が要る。
   検証でしか呼ばないが、同じ画像を何度も測るので結果は控えておく。

   チャンネルを潰して先に輝度にしてはいけない。肌は赤だけが 0.44 で
   緑青は半分以下、包帯は三色とも 0.6 近い——最大値で測ると
   どちらも 0.39 になって区別が付かなかった（実際そうなった）。
   sRGB の 2.2 乗近似で線形へ直してから平均する（先に平均してから
   線形へ直すと、暗部の多い絵ほど明るく出てしまう）。 */
var TEX_MEAN = /** @type {any[]} */ ([]);
function texMeanLinear(/** @type {any} */ img){
  if(!img || !img.width) return [1,1,1];
  for(var i=0;i<TEX_MEAN.length;i++) if(TEX_MEAN[i].k === img) return TEX_MEAN[i].v;
  var s = Math.min(64, img.width), c = makeCanvas(s), g = c.getContext('2d');
  g.drawImage(img, 0, 0, s, s);
  var d = g.getImageData(0,0,s,s).data, sr = 0, sg = 0, sb = 0;
  for(var q=0;q<s*s;q++){
    sr += Math.pow(d[q*4]/255, 2.2);
    sg += Math.pow(d[q*4+1]/255, 2.2);
    sb += Math.pow(d[q*4+2]/255, 2.2);
  }
  var n = s*s, v = [sr/n, sg/n, sb/n];
  TEX_MEAN.push({ k:img, v:v });
  return v;
}

/* 什器の汚れ。
   机・ロッカー・ドラム缶・ストレッチャー・車椅子——通路に置かれた物は
   どれもテクスチャを 1 枚も貼っていなかった。頂点色で色分けしただけの
   面は、どんなに形を作り込んでも「無地のプラスチックの箱」に見える。
   実際、積み上げた薬品ケースが白い立方体の山にしか見えなかった。

   1 枚を全種類で共用する。箱と円柱の UV は面ごとに 0..1 なので、
   面の実寸によって拡大率が変わるが、模様が絵ではなく汚れなら気にならない。
   平均が 0.8 前後になるようにして、地の色を暗くしすぎないようにする。 */
function texGrunge(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#d2d2ce'; g.fillRect(0,0,size,size);
  var K = (size/256)*(size/256);
  // 埃と汚れのむら
  for(var i=0;i<Math.round(70*K);i++){
    var px=rnd()*size, py=rnd()*size, rr=size*(0.03+rnd()*0.16);
    var gr=g.createRadialGradient(px,py,0,px,py,rr);
    gr.addColorStop(0,'rgba(70,66,58,'+(0.04+rnd()*0.16).toFixed(2)+')');
    gr.addColorStop(1,'rgba(70,66,58,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  // 垂れた跡。什器も壁と同じで、汚れは下へ流れる
  for(var d=0;d<Math.round(14*Math.sqrt(K));d++){
    var dx=rnd()*size, dw=(1+rnd()*4)*Math.sqrt(K), dh=size*(0.15+rnd()*0.5);
    var lg=g.createLinearGradient(0,0,0,dh);
    lg.addColorStop(0,'rgba(72,58,42,0.26)');
    lg.addColorStop(1,'rgba(72,58,42,0)');
    g.save(); g.translate(dx, rnd()*size*0.5);
    g.fillStyle=lg; g.fillRect(0,0,dw,dh); g.restore();
  }
  // 擦り傷。塗装が擦れて下地が出た細い線
  g.lineCap='round';
  for(var sc=0;sc<Math.round(30*Math.sqrt(K));sc++){
    var sx=rnd()*size, sy=rnd()*size, sa=rnd()*TAU, sl=size*(0.02+rnd()*0.14);
    g.strokeStyle='rgba(240,240,236,'+(0.10+rnd()*0.24).toFixed(2)+')';
    g.lineWidth=Math.max(1,size/420);
    g.beginPath(); g.moveTo(sx,sy);
    g.lineTo(sx+Math.cos(sa)*sl, sy+Math.sin(sa)*sl); g.stroke();
  }
  // 錆の点。金属の什器に効く
  for(var rs=0;rs<Math.round(26*K);rs++){
    var rx=rnd()*size, ry=rnd()*size, rr2=size*(0.004+rnd()*0.016);
    g.fillStyle='rgba(120,64,32,'+(0.18+rnd()*0.34).toFixed(2)+')';
    g.beginPath(); g.arc(rx,ry,rr2,0,TAU); g.fill();
  }
  valueNoise(g, size, Math.max(1, size/90), 0.06);
  return c;
}

/* 目地と地の艶の差を作る粗さマップ。
   釉薬をかけた病院のタイルは鏡に近く（粗さ 0.4 前後）、目地のモルタルと
   その上に乗った汚れは完全に拡散する（0.9 前後）。壁も床も全面を
   0.92 の一枚岩にしていたので、どこにも艶が乗らず、光を当てても
   「印刷された紙」にしか見えなかった。艶の有無は、寸法や模様よりも
   材質を伝える。n はタイルの分割数（地の絵と同じ数にする）。
   three は粗さを緑チャンネルから読むので緑だけ書く。
   色ではないので sRGB 変換を通してはいけない。 */
function texGloss(/** @type {any} */ size, /** @type {any} */ n, /** @type {any} */ lo, /** @type {any} */ hi, /** @type {any} */ grid){
  var c = makeCanvas(size), g = c.getContext('2d');
  var LO = Math.round(clamp(lo,0,1)*255), HI = Math.round(clamp(hi,0,1)*255);
  g.fillStyle = 'rgb(0,'+LO+',0)'; g.fillRect(0,0,size,size);
  var t = size/n;
  /* 目地。タイルの縁は釉薬が切れているので必ず鈍い。
     床には引かない。長尺シートの継ぎ目は目地ではなく溶接線で、
     ここに鈍い線を引くと、斜めから見たとき溶接線だけが明るく浮いて
     床じゅうに格子が乗った（粗い面ほど浅い角度では明るく返る）。 */
  if(grid){
    g.strokeStyle = 'rgb(0,'+HI+',0)';
    g.lineWidth = Math.max(2, t*0.11);
    for(var i=0;i<=n;i++){
      g.beginPath(); g.moveTo(i*t,0); g.lineTo(i*t,size); g.stroke();
      g.beginPath(); g.moveTo(0,i*t); g.lineTo(size,i*t); g.stroke();
    }
  }
  // 汚れと水垢。釉薬の上に乗るので艶を殺す
  for(var b=0;b<44;b++){
    var bx=rnd()*size, by=rnd()*size, br=size*(0.02+rnd()*0.10);
    var gr=g.createRadialGradient(bx,by,0,bx,by,br);
    gr.addColorStop(0,'rgba(0,'+HI+',0,'+(0.35+rnd()*0.50).toFixed(2)+')');
    gr.addColorStop(1,'rgba(0,'+HI+',0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(bx,by,br,0,TAU); g.fill();
  }
  // 何枚かはまだ艶が強く残っている。一様さを崩す
  var LO2 = Math.round(clamp(lo*0.70,0,1)*255);
  for(var k=0;k<Math.round(n*n/4);k++){
    var tx=Math.floor(rnd()*n), ty=Math.floor(rnd()*n);
    g.fillStyle = 'rgba(0,'+LO2+',0,0.55)';
    g.fillRect(tx*t+t*0.09, ty*t+t*0.09, t*0.82, t*0.82);
  }
  return c;
}

/* 明暗をそのまま粗さに読み替える。金属の擦れや刻みは「削れた所ほど
   細かい傷が付いて鈍く光る」ので、明るい所を粗く・暗い所を滑らかに
   するのが実物に近い（lo が明部の粗さ、hi が暗部の粗さ）。
   three は粗さを緑チャンネルから読むので、緑だけ書けばよい。 */
function roughFrom(/** @type {any} */ srcCanvas, /** @type {any} */ lo, /** @type {any} */ hi){
  var s = srcCanvas.width;
  var src = srcCanvas.getContext('2d').getImageData(0,0,s,s).data;
  var out = makeCanvas(s), og = out.getContext('2d');
  var img = og.createImageData(s,s), d = img.data;
  for(var i=0;i<s*s;i++){
    var l = (src[i*4]*0.299 + src[i*4+1]*0.587 + src[i*4+2]*0.114) / 255;
    var v = Math.round(clamp(hi + (lo - hi)*l, 0, 1) * 255);
    d[i*4] = 0; d[i*4+1] = v; d[i*4+2] = 0; d[i*4+3] = 255;
  }
  og.putImageData(img,0,0);
  return out;
}
// 区画表示板。病棟の壁に貼られた区画記号のプレート。
// 迷路は31x31・通路率約0.67で見た目の差が乏しいため、
// 「今どのあたりにいるか」を地図ではなく風景から読ませるための目印。
function texZone(/** @type {any} */ letter){
  var w = 256, h = 128;
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.fillStyle = '#0f1513'; g.fillRect(0,0,w,h);
  // 琺瑯板の地色。経年で黄ばみと汚れが乗っている
  g.fillStyle = '#cfc9b4'; g.fillRect(6,6,w-12,h-12);
  for(var i=0;i<26;i++){
    var px = rnd()*w, py = rnd()*h, rr = 4 + rnd()*22;
    var gr = g.createRadialGradient(px,py,0,px,py,rr);
    gr.addColorStop(0,'rgba(92,74,52,'+(0.06+rnd()*0.17)+')');
    gr.addColorStop(1,'rgba(92,74,52,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  g.strokeStyle = 'rgba(28,34,32,0.75)'; g.lineWidth = 3;
  g.strokeRect(12,12,w-24,h-24);
  g.fillStyle = '#1b2220';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'bold 74px ' + 'Helvetica,Arial,sans-serif';
  g.fillText(letter, w*0.36, h*0.52);
  g.font = '20px Helvetica,Arial,sans-serif';
  g.fillText('区画', w*0.72, h*0.40);
  g.font = '15px Helvetica,Arial,sans-serif';
  g.fillStyle = 'rgba(27,34,32,0.72)';
  g.fillText('第七病棟', w*0.72, h*0.66);
  // 剥がれ
  for(var k=0;k<7;k++){
    g.fillStyle = 'rgba(15,21,19,'+(0.10+rnd()*0.22)+')';
    g.fillRect(rnd()*w, rnd()*h, 2+rnd()*13, 2+rnd()*7);
  }
  return c;
}
// 一人称の腕の肌。無地の一色だと樹脂の筒に見えるので、
// 血色のむら・青白い静脈・古い痣を焼き込んで肌の凹凸を出す
function texSkin(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#b0846a'; g.fillRect(0,0,size,size);
  // 血色のむら
  for(var i=0;i<90;i++){
    var px=rnd()*size, py=rnd()*size, rr=size*(0.03+rnd()*0.16);
    var gr=g.createRadialGradient(px,py,0,px,py,rr);
    var warm = rnd()<0.5;
    gr.addColorStop(0, warm ? 'rgba(168,104,86,0.20)' : 'rgba(150,146,134,0.16)');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  // 皮膚の下を走る静脈。枝分かれさせながら伸ばす
  g.lineCap='round';
  for(var v=0;v<7;v++){
    var x=rnd()*size, y=rnd()*size, a=rnd()*TAU;
    g.strokeStyle='rgba(96,104,124,0.17)';
    g.lineWidth=size/190;
    g.beginPath(); g.moveTo(x,y);
    for(var k=0;k<16;k++){
      a += (rnd()-0.5)*0.7; x += Math.cos(a)*size*0.035; y += Math.sin(a)*size*0.035;
      g.lineTo(x,y);
    }
    g.stroke();
  }
  // 古い痣と擦り傷
  for(var b=0;b<5;b++){
    var bx=rnd()*size, by=rnd()*size, br=size*(0.04+rnd()*0.07);
    var bg=g.createRadialGradient(bx,by,0,bx,by,br);
    bg.addColorStop(0,'rgba(84,66,86,0.30)');
    bg.addColorStop(0.6,'rgba(110,78,72,0.16)');
    bg.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=bg; g.beginPath(); g.arc(bx,by,br,0,TAU); g.fill();
  }
  // 毛穴あらしの細かい粒子
  valueNoise(g, size, Math.max(1, size/64), 0.05);
  return c;
}
// 汚れた包帯。真っ白だと新品の樹脂に見えるので、織り目と染みを入れる
function texGauze(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#cfc9b8'; g.fillRect(0,0,size,size);
  // 織り目
  var step = Math.max(2, size/32);
  g.strokeStyle = 'rgba(120,114,100,0.28)'; g.lineWidth = 1;
  for(var i=0;i<size;i+=step){
    g.beginPath(); g.moveTo(i,0); g.lineTo(i,size); g.stroke();
    g.beginPath(); g.moveTo(0,i); g.lineTo(size,i); g.stroke();
  }
  // 染み（古い血と体液）
  for(var d=0;d<10;d++){
    var px=rnd()*size, py=rnd()*size, rr=size*(0.05+rnd()*0.14);
    var gr=g.createRadialGradient(px,py,0,px,py,rr);
    var blood = rnd()<0.45;
    gr.addColorStop(0, blood ? 'rgba(104,44,38,0.34)' : 'rgba(126,112,80,0.26)');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  valueNoise(g, size, Math.max(1, size/48), 0.06);
  return c;
}
/* ランプの筒。無地の暗い金属だと、画面の真ん中で「黒い円柱」に
   しか見えない（実際そうなっていた）。実物の懐中電灯は旋盤で削った
   跡が円周方向に細い筋として残り、角と稜だけ陽極酸化の被膜が擦れて
   地金が出る。その二つを焼く。
   円柱の UV は u が円周・v が軸方向なので、筋は横（u 方向）に引く。
   縦に引くと繋ぎ目で必ず途切れる。 */
function texLampMetal(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  /* 地色は明るくしておく。金属の反射率は材質の色で決めるので、
     テクスチャは「そこからどれだけ落ちるか」を持つ役。暗い地色
     （0x3a3d3f ＝ 線形 0.043）にすると、材質の色を上げても
     23 分の 1 に潰されて真っ黒のままになる（実際そうなった）。 */
  g.fillStyle = '#e6e8e8'; g.fillRect(0,0,size,size);
  // 旋盤の筋。1 画素ごとの明暗で、寄っても潰れない細さにする
  for(var i=0;i<size;i++){
    var v = (Math.sin(i*2.7)*0.5+0.5)*0.5 + rnd()*0.5;
    g.fillStyle = 'rgba(28,30,32,' + (v*0.20).toFixed(3) + ')';
    g.fillRect(0, i, size, 1);
  }
  // 陽極酸化の色むら。均一な塗りに見せない
  for(var b=0;b<14;b++){
    var bx=rnd()*size, by=rnd()*size, br=size*(0.10+rnd()*0.22);
    var gr=g.createRadialGradient(bx,by,0,bx,by,br);
    gr.addColorStop(0, rnd()<0.5 ? 'rgba(30,34,38,0.34)' : 'rgba(255,255,255,0.20)');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(bx,by,br,0,TAU); g.fill();
  }
  // 擦れて出た地金。短い明るい引っかき傷
  g.lineCap='round';
  for(var s2=0;s2<26;s2++){
    var sx=rnd()*size, sy=rnd()*size, sa=(rnd()-0.5)*0.5;
    var sl=size*(0.02+rnd()*0.10);
    g.strokeStyle='rgba(255,255,255,'+(0.16+rnd()*0.30).toFixed(2)+')';
    g.lineWidth=Math.max(1, size/300);
    g.beginPath(); g.moveTo(sx,sy);
    g.lineTo(sx+Math.cos(sa)*sl, sy+Math.sin(sa)*sl); g.stroke();
  }
  valueNoise(g, size, Math.max(1, size/96), 0.05);
  return c;
}
/* 握りのローレット。菱形の刻みは実物の握り部分そのもので、
   これがあると太さと丸みが一目で読める。刻みの数は円周方向 28・
   軸方向 12 で、実物の 0.8mm ピッチにおおよそ合う。 */
function texKnurl(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  // 地は筒と同じ明るさ。谷を暗く、山の頂を明るくする（金属の色は材質側）
  g.fillStyle = '#c8cccc'; g.fillRect(0,0,size,size);
  var NU = 28, NV = 12;
  g.lineWidth = Math.max(1, size/150);
  for(var d=0; d<2; d++){
    // 右上がりと右下がりの二方向。交差した所が菱形の谷になる
    g.strokeStyle = 'rgba(22,24,26,0.55)';
    for(var k=-NV; k<NU+NV; k++){
      var x0 = k/NU*size, x1 = x0 + (d ? size*NV/NU : -size*NV/NU);
      g.beginPath(); g.moveTo(x0, 0); g.lineTo(x1, size); g.stroke();
    }
  }
  // 山の頂だけ光る（谷は影になる）ので、点で明部を足す
  for(var v2=0; v2<NV; v2++) for(var u2=0; u2<NU; u2++){
    var px = (u2+0.5)/NU*size, py = (v2+0.5)/NV*size;
    var gr = g.createRadialGradient(px,py,0,px,py,size/NU*0.55);
    gr.addColorStop(0,'rgba(255,255,255,0.55)');
    gr.addColorStop(1,'rgba(0,0,0,0)');
    g.fillStyle=gr; g.beginPath(); g.arc(px,py,size/NU*0.55,0,TAU); g.fill();
  }
  return c;
}
// 非常口誘導の矢印。カルテが揃うまでは消灯していて読めない
function texArrow(){
  var w = 128, h = 128;
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  var g = c.getContext('2d');
  g.clearRect(0,0,w,h);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(w*0.86, h*0.50);
  g.lineTo(w*0.50, h*0.16);
  g.lineTo(w*0.50, h*0.36);
  g.lineTo(w*0.14, h*0.36);
  g.lineTo(w*0.14, h*0.64);
  g.lineTo(w*0.50, h*0.64);
  g.lineTo(w*0.50, h*0.84);
  g.closePath(); g.fill();
  return c;
}
function texCeil(/** @type {any} */ size){
  var c = makeCanvas(size), g = c.getContext('2d');
  g.fillStyle = '#232827'; g.fillRect(0,0,size,size);
  /* 天井。目地が外周に 1 本あるだけで、実質のっぺりした板だった。
     見上げたときに面積の広いところなので、ここが無地だと部屋の高さが
     読めない。システム天井の格子（約 70cm）を入れ、何枚かは
     抜け落ちて黒い穴になっているようにする。 */
  var NC = 12, tileC = size/NC;
  for(var cy=0; cy<NC; cy++) for(var cx=0; cx<NC; cx++){
    var missing = rnd() < 0.045;
    var sh2 = missing ? 0.18 : (0.92 + rnd()*0.16);
    g.fillStyle = 'rgb('+Math.floor(44*sh2)+','+Math.floor(48*sh2)+','+Math.floor(46*sh2)+')';
    g.fillRect(cx*tileC, cy*tileC, tileC, tileC);
    /* T バーの骨組み。明るい線を 1 本引いていたが、これは順番が逆だった。
       システム天井のバーは板と同じ塗りで、目に見えるのは「板とバーの間の
       溝に落ちる影」のほう。明るい線にすると、暗い病棟でも格子だけが
       白く浮いてワイヤーフレームを重ねたように見える（床の目地で同じ
       間違いを直したのと同じ話）。暗い溝を引き、その内側にだけ細い
       ハイライトを添える。 */
    var lw = Math.max(1, size/340);
    g.strokeStyle = missing ? 'rgba(8,9,8,0.9)' : 'rgba(16,18,17,0.62)';
    g.lineWidth = lw;
    g.strokeRect(cx*tileC + 0.5, cy*tileC + 0.5, tileC - 1, tileC - 1);
    if(!missing){
      g.strokeStyle = 'rgba(118,122,114,0.20)';
      g.lineWidth = Math.max(1, lw*0.6);
      g.strokeRect(cx*tileC + lw + 0.5, cy*tileC + lw + 0.5, tileC - lw*2 - 1, tileC - lw*2 - 1);
    }
  }
  for(var i=0;i<60;i++){
    var px=rnd()*size, py=rnd()*size, rr=rnd()*size*0.25;
    var grad=g.createRadialGradient(px,py,0,px,py,rr);
    grad.addColorStop(0,'rgba(10,10,8,'+(rnd()*0.3)+')');
    grad.addColorStop(1,'rgba(10,10,8,0)');
    g.fillStyle=grad; g.beginPath(); g.arc(px,py,rr,0,TAU); g.fill();
  }
  return c;
}
// ハイトマップ → ノーマルマップ
function normalFrom(/** @type {any} */ canvas, /** @type {any} */ strength){
  var s = canvas.width;
  var src = canvas.getContext('2d').getImageData(0,0,s,s).data;
  var out = makeCanvas(s), og = out.getContext('2d');
  var img = og.createImageData(s,s), d = img.data;
  function h(/** @type {any} */ x,/** @type {any} */ y){
    x = (x+s)%s; y = (y+s)%s;
    var i = (y*s+x)*4;
    return (src[i]*0.299 + src[i+1]*0.587 + src[i+2]*0.114)/255;
  }
  for(var y=0;y<s;y++) for(var x=0;x<s;x++){
    var dx = (h(x-1,y)-h(x+1,y)) * strength;
    var dy = (h(x,y-1)-h(x,y+1)) * strength;
    var len = Math.sqrt(dx*dx+dy*dy+1);
    var i = (y*s+x)*4;
    d[i]   = ((dx/len)*0.5+0.5)*255;
    d[i+1] = ((dy/len)*0.5+0.5)*255;
    d[i+2] = ((1/len)*0.5+0.5)*255;
    d[i+3] = 255;
  }
  og.putImageData(img,0,0);
  return out;
}
function glowSprite(/** @type {any} */ color){
  var s = 128, c = makeCanvas(s), g = c.getContext('2d');
  var grad = g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35,'rgba(255,255,255,0.16)');
  grad.addColorStop(1,'rgba(255,255,255,0)');
  g.fillStyle = grad; g.fillRect(0,0,s,s);
  return c;
}
function blobShadow(){
  var s = 128, c = makeCanvas(s), g = c.getContext('2d');
  var grad = g.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
  grad.addColorStop(0,'rgba(0,0,0,0.75)');
  grad.addColorStop(0.6,'rgba(0,0,0,0.28)');
  grad.addColorStop(1,'rgba(0,0,0,0)');
  g.fillStyle = grad; g.fillRect(0,0,s,s);
  return c;
}
function grainDataURL(){
  var s = 96, c = makeCanvas(s), g = c.getContext('2d');
  var img = g.createImageData(s,s), d = img.data;
  for(var i=0;i<d.length;i+=4){
    var v = 40 + Math.random()*215;
    d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  g.putImageData(img,0,0);
  return c.toDataURL();
}


/* =========================================================================
   7. マテリアル／テクスチャの準備
   ========================================================================= */
var TEX = {};
var envRT = null;          // 環境マップ（PMREM 済み）。品質変更のたびに作り直す
/* 環境マップ（映り込み）。
   金属を metalness 0.75 で置いても、映すものが無ければ真っ黒にしかならない。
   ランプの筒も、ドラム缶の胴も、扉の把手も、これまで全部「暗い灰色の板」
   だった。粗い面もいっしょで、環境からの間接的な照り返しが無いぶん
   のっぺり見える。製品が必ず持っているのがこの一枚。

   外部ファイルは持てないので、廊下そのものを描く。
   上（天井）は薄暗く、下（床）はさらに暗く、水平線のあたりに非常灯の
   暖色をいくつか置く。これを PMREM に通すと、粗さごとにぼけた
   ミップが作られて、そのまま全マテリアルの映り込みになる。 */
function texEnvPano(){
  var w = 256, h = 128, c = makeCanvas(w); c.height = h;
  var g = c.getContext('2d');
  // 縦方向のグラデーション。上端＝天頂、下端＝真下
  var lg = g.createLinearGradient(0, 0, 0, h);
  lg.addColorStop(0.00, '#0c1116');      // 天井。ほのかに明るい
  lg.addColorStop(0.42, '#151b20');
  lg.addColorStop(0.55, '#1b2126');      // 水平線あたりが一番明るい
  lg.addColorStop(1.00, '#04070a');      // 床は落ちる
  g.fillStyle = lg; g.fillRect(0,0,w,h);
  // 非常灯。等間隔だと回転したときに縞が動いて見えるので、間隔を崩す
  var lamps = [0.08, 0.31, 0.44, 0.72, 0.91];
  for(var i=0;i<lamps.length;i++){
    var lx = lamps[i]*w, ly = h*0.47, rr = w*(0.05 + (i%2)*0.02);
    var gr = g.createRadialGradient(lx, ly, 0, lx, ly, rr);
    gr.addColorStop(0, 'rgba(255,182,96,0.85)');
    gr.addColorStop(0.4, 'rgba(150,110,66,0.28)');
    gr.addColorStop(1, 'rgba(150,110,66,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(lx, ly, rr, 0, TAU); g.fill();
  }
  // 廊下の縦の切れ目。映り込みに縦線が入ると「部屋の中にいる」感じになる
  g.globalAlpha = 0.5;
  for(var v=0; v<9; v++){
    var vx = (v*w/9 + 7) % w;
    g.fillStyle = 'rgba(2,4,6,0.7)';
    g.fillRect(vx, h*0.30, Math.max(1, w*0.012), h*0.40);
  }
  g.globalAlpha = 1;
  return c;
}
function buildEnvMap(){
  if(envRT){ envRT.dispose(); envRT = null; }
  if(!(settings.quality|0)) return;      // 最低品質では PMREM の生成ぶんを省く
  try{
    var tx = new THREE.CanvasTexture(texEnvPano());
    tx.mapping = THREE.EquirectangularReflectionMapping;
    tx.encoding = THREE.sRGBEncoding;
    var pm = new THREE.PMREMGenerator(renderer);
    pm.compileEquirectangularShader();
    envRT = pm.fromEquirectangular(tx);
    pm.dispose(); tx.dispose();
  }catch(e){ envRT = null; }             // 生成に失敗しても遊べる状態は保つ
  /* scene.environment に入れると、すべての MeshStandardMaterial の
     全画素にキューブマップ参照（粗さによるミップ選択と分割和の LUT）が
     乗る。壁・床・天井は粗い誘電体で映り込みの寄与がほとんど無いのに、
     画面の 9 割を占めるのでそこだけで代金を払っていた。
     実測：最高品質のフレーム時間 365ms → 236ms（−35%）。
     映り込みが効くのは金属だけなので、その材質にだけ直接付ける。 */
  scene.environment = null;
  if(viewScene) viewScene.environment = null;
  applyEnvMap();
}
/* 映り込みを付ける材質を 1 か所にまとめる。作り直したときは呼び直す。 */
var ENV_MATS = [];
function applyEnvMap(){
  var t = envRT ? envRT.texture : null;
  for(var i=0;i<ENV_MATS.length;i++){
    var m = ENV_MATS[i];
    if(!m) continue;
    if(m.envMap !== t){ m.envMap = t; m.needsUpdate = true; }
  }
}
function regEnvMat(m){
  if(ENV_MATS.indexOf(m) < 0) ENV_MATS.push(m);
  if(envRT){ m.envMap = envRT.texture; m.needsUpdate = true; }
  return m;
}

/* 品質を変えたときにテクスチャを作り直す。
   ここが抜けていた。buildTextures は起動時に一度しか走らず、設定で
   「最高品質」にしても壁も肌も 128px のまま、法線マップも作られない
   （normalMaps が false の品質で組んだ TEX を持ち回っていた）。
   実機では気づきにくいが、追跡者を至近距離で撮って
   map が 128x128・normalMap 無しなのを見て発覚した。

   長生きするマテリアル（追跡者の位置表示スプライトと埃）だけが
   古いテクスチャを掴んだままになるので、そこは張り替える。 */
var texBuiltQ = -1;
function disposeTextures(){
  for(var k in TEX){
    if(!TEX.hasOwnProperty(k)) continue;
    var v = TEX[k];
    if(!v) continue;
    if(Array.isArray(v)){ for(var i=0;i<v.length;i++) if(v[i] && v[i].dispose) v[i].dispose(); }
    else if(v.dispose) v.dispose();
  }
  TEX = {};
}
function ensureTextures(){
  var q = settings.quality|0;
  if(texBuiltQ === q) return;
  if(texBuiltQ >= 0) disposeTextures();
  buildTextures();
  buildEnvMap();
  texBuiltQ = q;
  if(hunterMark) hunterMark.material.map = TEX.glowR;
  if(dustPts){ dustPts.material.map = TEX.glowW; dustPts.material.needsUpdate = true; }
}

function buildTextures(){
  var s = QC.tex;
  function mk(canvasEl, rx, ry){
    var t = new THREE.CanvasTexture(canvasEl);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    t.encoding = THREE.sRGBEncoding;
    t.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 1);
    return t;
  }
  var wc = texWall(s), fc = texFloor(s), cc = texCeil(s);
  TEX.wall  = mk(wc, 1, 1);
  TEX.floor = mk(fc, GW, GH);
  TEX.ceil  = mk(cc, GW/2, GH/2);
  if(QC.normalMaps){
    var wn = new THREE.CanvasTexture(normalFrom(wc, 3.0));
    wn.wrapS = wn.wrapT = THREE.RepeatWrapping;
    TEX.wallN = wn;
    var fn = new THREE.CanvasTexture(normalFrom(fc, 2.0));
    fn.wrapS = fn.wrapT = THREE.RepeatWrapping; fn.repeat.set(GW,GH);
    TEX.floorN = fn;
  }
  TEX.glowW = new THREE.CanvasTexture(glowSprite('rgba(255,236,190,0.95)'));
  TEX.glowG = new THREE.CanvasTexture(glowSprite('rgba(150,255,220,0.95)'));
  TEX.shadow = new THREE.CanvasTexture(blobShadow());
  TEX.glowR = new THREE.CanvasTexture(glowSprite('rgba(255,96,74,0.95)'));

  // 区画表示板：3x3に区切った9区画ぶんの記号。板は小さいので低品質でも実寸で焼く
  TEX.zone = [];
  for(var zi=0; zi<ZONE_LETTERS.length; zi++){
    var zt = new THREE.CanvasTexture(texZone(ZONE_LETTERS[zi]));
    zt.encoding = THREE.sRGBEncoding;
    TEX.zone.push(zt);
  }
  TEX.arrow = new THREE.CanvasTexture(texArrow());

  /* 皮膚は体に貼り付いていて壁ほど視界を占めないので、半分の解像度で足りる。
     ただし静脈が消える 128 未満には落とさない。 */
  var flc = texFlesh(Math.max(128, s >> 1));
  TEX.flesh = mk(flc, 1, 1);
  /* 皮膚は実寸に比例した UV で貼るので、1 を超える。手続き生成の絵は
     継ぎ目まで面倒を見ていないため、そのまま繰り返すと縦横に線が出る。
     鏡像で折り返せば、どんな絵でも必ず繋がる。 */
  TEX.flesh.wrapS = TEX.flesh.wrapT = THREE.MirroredRepeatWrapping;
  /* 法線と粗さは色ではないので sRGB 変換を通してはいけない。
     mk() は sRGB を付けるので、ここは自前で組む（通すと凹凸が反転気味に
     浅くなり、粗さは全体に光りすぎる）。 */
  if(QC.normalMaps){
    var fn2 = new THREE.CanvasTexture(normalFrom(flc, 2.2));
    fn2.wrapS = fn2.wrapT = THREE.MirroredRepeatWrapping;
    TEX.fleshN = fn2;
  }
  var fr2 = new THREE.CanvasTexture(texFleshRough(flc));
  fr2.wrapS = fr2.wrapT = THREE.MirroredRepeatWrapping;
  TEX.fleshR = fr2;

  /* 壁の痕跡。透明度を持つので繰り返さない（1 枚 1 か所に貼る）。 */
  TEX.decal = new THREE.CanvasTexture(texDecals(Math.max(256, s)));
  TEX.decal.encoding = THREE.sRGBEncoding;

  /* 壁と床の艶。地の絵と同じタイル割りで作る（壁 4x4・床 6x6）。
     繰り返しは地の絵に合わせないと目地とずれる。 */
  function mkR(canvasEl, rx, ry){
    var t = new THREE.CanvasTexture(canvasEl);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(rx, ry);
    return t;                                    // sRGB を付けない（色ではない）
  }
  /* 壁は控えめに。0.40 まで下げたら一枚の乳白色の板になって、
     せっかくのタイルと汚れが specular に飲まれた（実測で試した）。
     艶そのものより「艶にむらがある」ことが材質を伝える。
     床は斜めから見るので艶が効く。目地は引かない。 */
  if(QC.gloss){
    TEX.wallR  = mkR(texGloss(Math.max(128, s>>1), 4, 0.74, 0.98, 1), 1, 1);
    /* 濡れむら。斑点が 6 個しかなく、しかも地図全面に同じ絵を繰り返すので
       床はほぼ一様な艶になっていた。数を増やし、幅も広げる
       （0.42 は水の膜が残っているところ、0.98 は乾いて粉を吹いたところ）。 */
    TEX.floorR = mkR(texGloss(Math.max(128, s>>1), 14, 0.42, 0.98, 0), GW, GH);
  }

  /* 什器の汚れ。全種類で 1 枚を共用する。面ごとに 0..1 の UV なので
     繰り返しは掛けない（掛けると小さい面ほど模様が細かくなる）。 */
  var gc = texGrunge(Math.max(128, s>>1));
  TEX.grunge = mk(gc, 1, 1);
  if(QC.gloss) TEX.grungeR = mkR(roughFrom(gc, 0.52, 0.92), 1, 1);
}


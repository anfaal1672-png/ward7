/* =========================================================================
   6. レンダラ／シーン
   ========================================================================= */
/* 内部解像度の自動調整（設計指示書 第 8.3 節）。
   端末の画素密度 × 品質ごとの上限 に、さらに 0.6〜1.0 の倍率を掛ける。
   フレーム時間が目標（約 55fps）を超え続けたら少しずつ下げ、余裕が続いたら戻す。
   iPhone は 10 分を過ぎたあたりで熱で落ちるので、急に 20fps になるより、
   ずっと少しだけ粗い方が体験を壊さない。iOS アプリからは端末の温度の段階も届き、
   熱いときは上限そのものを下げる（ios/Sources/AppDelegate.swift）。
   自動操作（検証ツール）の下では動かさない。撮った絵の解像度が揃わなくなるため。 */
var DRS = { scale:1, max:1, min:0.6, slowT:0, fastT:0, cool:0, ema:1/60,
            on: !navigator.webdriver || /[?&]drs=1/.test(location.search) };
var THERMAL = { level:0 };
function effPixelRatio(){ return Math.min(window.devicePixelRatio||1, QC.pixelCap) * DRS.scale; }
window.__w7thermal = function(/** @type {any} */ n){           // 0 nominal / 1 fair / 2 serious / 3 critical
  THERMAL.level = n|0;
  DRS.max = THERMAL.level >= 3 ? 0.7 : (THERMAL.level >= 2 ? 0.8 : 1);
  if(DRS.scale > DRS.max){ DRS.scale = DRS.max; resize(); }
};
function updateDRS(/** @type {number} */ dt){
  if(!DRS.on || state !== STATE.PLAY) return;
  DRS.ema = lerp(DRS.ema, dt, 0.08);
  DRS.cool -= dt;
  var target = 1/55;
  if(DRS.ema > target*1.12){ DRS.slowT += dt; DRS.fastT = 0; }
  else if(DRS.ema < target*0.80){ DRS.fastT += dt; DRS.slowT = 0; }
  else { DRS.slowT = 0; DRS.fastT = 0; }
  if(DRS.cool > 0) return;
  var want = DRS.scale;
  if(DRS.slowT > 1.0) want = Math.max(DRS.min, DRS.scale - 0.08);
  else if(DRS.fastT > 3.0) want = Math.min(DRS.max, DRS.scale + 0.05);
  if(want !== DRS.scale){
    DRS.scale = want; DRS.slowT = DRS.fastT = 0; DRS.cool = 1.5;
    resize();                                  // 描画先の大きさ（後処理の RT も）を合わせ直す
  }
}
var canvas = $('scene');
var renderer = /** @type {any} */ (undefined), scene = /** @type {any} */ (undefined), camera = /** @type {any} */ (undefined);
var CTX_LOST = false;

function qualityCfg(){
  var q = clamp(settings.quality|0, 0, 3);
  return {
    /* 描画解像度の上限。実機は dpr=3 が普通なので、3.0 は「画素密度そのまま」
       ＝ 720p の 9 倍を毎フレーム塗ることになる。実測（390x844・dpr=3）で
       フレーム時間 637ms。2.2 に下げると 366ms——43% 速い。
       落ちた解像度ぶんの輪郭は、最終合成の持ち上げ（uSharp）が
       ちょうどこの差から自動で強さを決めて埋める。 */
    pixelCap: [1.0, 1.4, 1.8, 2.2][q],
    aa:       q >= 2,
    tex:      [128, 256, 512, 1024][q],
    fogD:     [0.072, 0.060, 0.060, 0.050][q],
    lamps:    [2, 3, 3, 4][q],
    normalMaps: q > 0,
    /* 艶のむら（粗さマップ）。壁と床という画面の大半に 1 枚ずつ
       テクスチャ参照が増える。最低品質はポスト処理が無いぶん
       画素の計算が全体に占める割合が大きく、実測でフレーム時間が
       61.8 → 66.5ms（+7.6%）になったので、そこだけ切る。 */
    gloss:    q > 0,
    props:    [24, 44, 44, 70][q],
    cssFx:    q > 0,
    post:     q >= 1,          // 画面エフェクト（軽量では負荷を避けて切る）
    shadows:  q >= 3,          // 最高品質のみ：ランプが本物の影を落とす
    bloom:    q >= 3,          // 最高品質のみ：光が滲む（縮小バッファ＋分離ブラー）
    dust:     q >= 2,          // 高精細以上：ランプの光に舞う埃
    shaft:    q >= 2,          // 高精細以上：非常口から差す光
    beam:     q >= 2,          // 高精細以上：ランプの光の筋（深度から散乱を積む。1/2 解像度）
    ssao:     q >= 3,          // 最高品質のみ：接地の陰（同じパスで深度から）
    fxaa:     q >= 1,          // 標準以上：輪郭の均し（合成パスの中で）
    detail:   q >= 3,          // 追跡者の追加ディテール
    /* 追跡者に焼き込む遮蔽の光線本数。0 で焼かない。
       生成時に一度だけ走る計算なので実行中の負荷はゼロだが、
       低スペック端末では起動が数十 ms 伸びるので段階的に落とす。 */
    hao:      [0, 0, 6, 12][q],
    signs:    [2, 3, 3, 3][q]   // 1区画あたりの表示板の枚数
  };
}
var QC = qualityCfg();

try{
  renderer = new THREE.WebGLRenderer({
    canvas: canvas, antialias: QC.aa, alpha:false,
    powerPreference:'high-performance', stencil:false, depth:true
  });
}catch(e){
  fatal('レンダラを初期化できませんでした: ' + e.message);
  return;
}
renderer.setPixelRatio(effPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
/* 既定の露出。1.18 のままだと画面平均が 53.6 まで落ちて、明るい部屋で
   スマホを見たときに何も見えない懸念があった。1.34 で 65.4——元の 104 より
   ずっと締まっているが、暗すぎもしない。足りない人は設定の明るさ
   （0.6〜1.9 倍）で戻せる。 */
var EXP_BASE = 1.34;

/* 品質ごとの露出の微調整。
   ここは長いあいだ「ポスト処理を通さない品質だけ 1.25 倍」で済ませていた。
   ところが renderer.toneMappingExposure を設定画面と起動時にしか
   書き込んでいなかったので、起動後に品質を変えると露出が古いままだった。
   検証ツールは毎回そこを通る（起動時は低品質、その後 q3 で開始）ため、
   最高品質の画をずっと 1.34 ではなく 1.675 で撮っていた。
   この 25% を測り込んだまま露出を決めていたので、実機では最初から
   想定より暗い画が出ていたことになる。露出は毎フレーム書き直す。

   直したうえで四段階を実測すると 51.9 / 66.1 / 62.2 / 57.6 と割れた。
   最終合成の持ち上げの有無・影・霧の濃さが品質で違うためで、同じ露出で
   揃うものではない。実測から逆算した係数を品質ごとに掛けて揃える。
   その後ビームを 33 度から 26 度へ絞ったぶん照らされる面積が減り、
   平均が 50 前後まで落ちたので 1.15 倍して 58 前後へ戻した。
   さらに、露出の見積もりに入射角を入れたことで浅い角度の場面が
   軒並み暗いと判定されるようになり（＝露出が開き）、69 前後まで
   上がったので、実測から逆算して掛け直した。
   実測 58.3 / 60.3 / 61.9 / 57.9。 */
var EXP_Q = [1.40, 0.87, 1.02, 1.24];
/* 自動露出（明順応）の倍率。何にどれだけ近くで光が当たっているかから
   毎フレーム作り直す。第15章の updateExposure を参照。
   宣言をここに置くのは、露出を読む側と同じ場所に無いと見落とすため。 */
var expAdapt = 1;
/* 足元の補助光を既定の位置と強さへ戻す。死亡演出でここを床へ降ろして
   「落ちたランプ」に流用しているので、遊び直すときとタイトルへ戻るときの
   両方で戻す必要がある（片方だけ直して一度取りこぼした）。 */
var PLIGHT_I = 0.88;
function resetPlayerLight(){
  if(!playerLight) return;
  playerLight.position.set(0, 0, 0);
  playerLight.intensity = PLIGHT_I;
}
function exposureNow(){
  return EXP_BASE * EXP_Q[clamp(settings.quality|0, 0, 3)] *
         expAdapt * (settings.gamma || 1);
}
renderer.toneMappingExposure = EXP_BASE;
renderer.shadowMap.enabled = false;
renderer.setClearColor(0x04070a, 1);

scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x05090c, QC.fogD);

camera = new THREE.PerspectiveCamera(72, 1, 0.05, 200);
camera.rotation.order = 'YXZ';

canvas.addEventListener('webglcontextlost', function(/** @type {any} */ e){
  e.preventDefault(); CTX_LOST = true;
  if(state === STATE.PLAY) doPause();
  toast('描画が中断されました', 3);
}, false);
canvas.addEventListener('webglcontextrestored', function(){
  CTX_LOST = false;
  renderer.setPixelRatio(effPixelRatio());
  resize();
  toast('描画を復帰しました', 2);
}, false);

function resize(){
  var w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  renderer.setPixelRatio(effPixelRatio());       // 自動調整の倍率（DRS）を反映する
  renderer.setSize(w, h, false);
  camera.aspect = w/h;
  // 縦持ちでは視野を少し広げて閉塞感を保ちつつ見やすく
  camera.fov = ((h > w) ? 78 : 70) + settings.fov;
  camera.updateProjectionMatrix();
  if(viewCam){
    viewCam.aspect = w/h;
    viewCam.fov = (h > w) ? 60 : 52;
    viewCam.updateProjectionMatrix();
  }
  if(bloomA){
    var bs = new THREE.Vector2(); renderer.getDrawingBufferSize(bs);
    var bw2 = Math.max(1, Math.floor(bs.x/4)), bh2 = Math.max(1, Math.floor(bs.y/4));
    bloomA.setSize(bw2, bh2); bloomB.setSize(bw2, bh2);
    if(blurMat) blurMat.uniforms.uTexel.value.set(1/bw2, 1/bh2);
  }
  if(postRT && postMat){
    var ds = new THREE.Vector2();
    renderer.getDrawingBufferSize(ds);
    postRT.setSize(Math.max(1, ds.x), Math.max(1, ds.y));
    if(taaA){
      taaA.setSize(Math.max(1, ds.x), Math.max(1, ds.y)); taaB.setSize(Math.max(1, ds.x), Math.max(1, ds.y));
      taaMat.uniforms.uRes.value.set(ds.x, ds.y); taaReset = true;
    }
    if(fxRT){
      var fw2 = Math.max(1, Math.floor(ds.x/2)), fh2 = Math.max(1, Math.floor(ds.y/2));
      fxRT.setSize(fw2, fh2); fxMat.uniforms.uRes.value.set(fw2, fh2);
    }
    postMat.uniforms.uRes.value.set(ds.x, ds.y);
  }
  if(viewRig){
    // 縦持ちは横方向の画角が狭く、腕が画面外へ逃げるので内側へ寄せる
    var portrait = (h > w);
    // 横持ちは水平画角が広いぶん、腕を外側へ寄せないと画面中央に居座ってしまう
    viewRig.position.set(portrait ? 0 : 0.078, portrait ? 0 : -0.004, 0);
    viewRig.scale.setScalar(portrait ? 1.0 : 1.04);
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', function(){ setTimeout(resize, 260); });
resize();


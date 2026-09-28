/* =========================================================================
   8. ワールド構築
   ========================================================================= */
var world = {
  grid:null, walls:null, props:[], records:[], batteries:[],
  lamps:[], lampLights:[], exit:null, exitLight:null, group:null,
  rooms:[], hides:[], key:null, lockDoor:null, lever:null, power:false, endgame:false,
  zones:[], exitField:null, nav:null
};

function disposeObject(obj){
  obj.traverse(function(o){
    if(o.geometry) o.geometry.dispose();
    if(o.material){
      var mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(function(m){ if(m.dispose) m.dispose(); });
    }
  });
}
function clearWorld(){
  if(world.exitLight){ scene.remove(world.exitLight); world.exitLight = null; }
  if(world.group){
    scene.remove(world.group);
    disposeObject(world.group);
  }
  world.group = new THREE.Group();
  scene.add(world.group);
  world.props = []; world.records = []; world.batteries = []; world.bottles = []; world.bandages = [];
  world.lamps = []; world.exit = null; world.hides = [];
  world.key = null; world.lockDoor = null; world.lever = null; world.power = false; world.blackout = false;
  world.mats = null; world.photo = false;
  world.zones = []; world.exitField = null; world.nav = null;
}

var lightPool = [];   // 非常灯用の固定ポイントライト（付け外しせず位置だけ動かす＝シェーダ再コンパイル回避）
var flashlight, flashTarget, playerLight, ambient, hemi, hunterMark, hunterEyeLight;
// 一人称の腕。壁にめり込まないよう専用のシーンで最後に描く
var viewScene = null, viewCam = null, viewArm = null, viewRig = null, viewParts = null;
var viewSway = { x:0, y:0, tx:0, ty:0 };
var viewBeam = { x:0, y:0 };        // 腕の傾きから作る、ランプの照射方向のずれ

var LAMP_I = 5.0;          // 懐中電灯の強さ（点灯時）。絞ったぶん上げた
/* 照射角（軸からの半角）。ここを一か所に持たないと、露出の見積もりが
   使う角度と実際の光の角度がずれる（実際 33 度のまま残っていた）。 */
var LAMP_ANG = Math.PI/6.8;
var AMB_BASE = 0.42;       // 環境光の基準値。毎フレームここから作り直す
function setupLights(){
  /* 環境光を強く入れると、どの面も最低限の明るさを持ってしまい、
     せっかく焼いた遮蔽も懐中電灯の輪も見えなくなる。落とす。
     ただしここの値は初期値でしかなく、遊んでいる間は毎フレーム
     AMB_BASE から作り直される。前にここだけ 0.46→0.32 に変えて
     効いたつもりになっていた（懐中電灯の強さと同じ間違い）。 */
  ambient = new THREE.AmbientLight(0x1a2430, AMB_BASE);
  scene.add(ambient);
  hemi = new THREE.HemisphereLight(0x243244, 0x090b0d, 0.28);
  scene.add(hemi);

  /* 減衰を 1.15 にしていたので、8m 先の突き当たりが手元の壁と同じ明るさで
     返ってきていた。光の輪が無く、廊下全体がのっぺり明るい。実際の
     携行灯は距離の二乗で落ちる。2.0 では足元しか見えず遊べないので、
     間を取って 1.65。届く距離も 34m → 28m に詰め、代わりに手元の
     強さを 3.2 → 4.4 に上げて、近くの明るさは保ったまま先だけ暗くする。 */
  /* 強さは毎フレーム更新するので、ここの値は初期値でしかない
     （以前ここだけ変えて効いたつもりになっていた）。LAMP_I を唯一の出所にする。 */
  /* 照射角と減衰。33 度・penumbra 0.62 は「広くて縁がぼやけた円」で、
     突き当りの壁が一様に明るい板になっていた。実物の懐中電灯は
     反射鏡で絞られていて、中心が強く縁が急に落ちる。26 度・0.48 にして
     そのぶん強さを上げる（露出は自動で追従するので画面全体は暗くならない）。 */
  flashlight = new THREE.SpotLight(0xffe9c4, LAMP_I, 28, LAMP_ANG, 0.48, 1.65);
  flashlight.position.set(0,0,0);
  flashTarget = new THREE.Object3D();
  scene.add(flashTarget);
  flashlight.target = flashTarget;
  camera.add(flashlight);

  /* 足元の補助光。ビームを 33 度から 26 度へ絞ったので、これを
     0.55 まで落とすと足元まで真っ暗になり、画面の 4 割が最暗部に
     沈んだ（実測 平均輝度 58.6 → 48.3）。絞りの効果は遠くの側壁に
     出るもので、手前の床は別問題。範囲だけ詰めて強さは戻す。 */
  playerLight = new THREE.PointLight(0xffdcae, PLIGHT_I, 9, 1.8);
  camera.add(playerLight);
  scene.add(camera);

  // 完全探知モードで壁越しに見える標識
  // 追跡者の目から漏れる赤い光。角の向こうの壁を先に染める
  hunterEyeLight = new THREE.PointLight(0xff2a14, 0, 7.5, 2);
  hunterEyeLight.position.set(0, 2, 0);
  scene.add(hunterEyeLight);

  hunterMark = new THREE.Sprite(new THREE.SpriteMaterial({
    map: TEX.glowR, transparent:true, blending:THREE.AdditiveBlending,
    depthTest:false, depthWrite:false, opacity:0.55
  }));
  hunterMark.scale.set(1.6,1.6,1);
  hunterMark.renderOrder = 999;
  hunterMark.visible = false;
  scene.add(hunterMark);

  for(var i=0;i<4;i++){
    var pl = new THREE.PointLight(0xffb75a, 0, 11, 2);
    pl.position.set(0, WALL_H-0.5, 0);
    scene.add(pl);
    lightPool.push(pl);
  }
}

/* ---- 光源のカリング ----
   three.js のシェーダは、シーンにある「見えている」ライトの数だけ
   ピクセルごとのループを回す。強度 0 のライトも、届かない位置のライトも、
   visible が true である限り全画素ぶんの計算を食う。

   減衰距離 d を持つポイントライトは、自分から d より遠い点には数学的に
   一切寄与しない。つまり「中心=ライト位置・半径=d の球」が視錐台に
   掛からなければ、消しても絵は 1 ピクセルも変わらない。これを毎フレーム
   判定して visible を落とす。非常灯 4 灯と追跡者の目は普段ほぼ画面外なので、
   実効ポイントライト数は 6 から 2〜3 に落ちる。

   ライト数が変わるとシェーダのバリアントが切り替わるため、初回だけ
   コンパイル待ちが入る。それは prewarmLights() で読み込み中に済ませる。 */
var _lightFrustum = new THREE.Frustum(), _lightM4 = new THREE.Matrix4(), _lightSphere = new THREE.Sphere();
function cullLights(){
  camera.updateMatrixWorld();
  _lightM4.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  _lightFrustum.setFromProjectionMatrix(_lightM4);
  for(var i=0;i<lightPool.length;i++) applyLightCull(lightPool[i]);
  if(hunterEyeLight) applyLightCull(hunterEyeLight);
  if(world.exitLight) applyLightCull(world.exitLight);
}
function applyLightCull(L){
  if(L.intensity <= 0.001){ L.visible = false; return; }
  _lightSphere.center.copy(L.position);
  _lightSphere.radius = L.distance > 0 ? L.distance : 1e6;   // 減衰なしなら常に効く
  L.visible = _lightFrustum.intersectsSphere(_lightSphere);
}

// ライト数のバリアントを読み込み中に焼いておく。
// 走っている最中に初めて出る組み合わせがあると、そこで一瞬止まる
function prewarmLights(){
  if(!renderer.compile) return;
  var pool = [];
  for(var i=0;i<lightPool.length;i++) pool.push(lightPool[i]);
  if(hunterEyeLight) pool.push(hunterEyeLight);
  if(world.exitLight) pool.push(world.exitLight);
  var saved = pool.map(function(L){ return L.visible; });
  for(var n=0; n<=pool.length; n++){
    for(var k=0;k<pool.length;k++) pool[k].visible = (k < n);
    try{ renderer.compile(scene, camera); }catch(e){ break; }
  }
  for(var r=0;r<pool.length;r++) pool[r].visible = saved[r];
}

/* ---- 空気中の埃 ------------------------------------------------------
   暗い場所でランプを振ったとき、光の筋が見えるかどうかで空気の有無が決まる。
   本物の体積光は高いので、光の中を漂う粒を置いて代わりにする。
   粒はプレイヤーの周り 7m の箱に散らし、動いたら箱の外に出たぶんだけ
   反対側へ回り込ませる（無限に湧いているように見える）。
   ランプが消えているときは薄くする——照らされていない埃は見えない。 */
var dustPts = null, dustPos = null;
var DUST_BOX = 7.0;

function buildDust(){
  if(dustPts){ scene.remove(dustPts); dustPts.geometry.dispose(); dustPts = null; }
  if(!QC.dust) return;
  var n = (settings.quality >= 3) ? 520 : 260;
  dustPos = new Float32Array(n*3);
  for(var i=0;i<n;i++){
    dustPos[i*3]   = player.x + (Math.random()-0.5)*DUST_BOX*2;
    dustPos[i*3+1] = Math.random()*2.6;
    dustPos[i*3+2] = player.z + (Math.random()-0.5)*DUST_BOX*2;
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var m = new THREE.PointsMaterial({
    size:0.028, map:TEX.glowW, transparent:true, opacity:0.0,
    blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true,
    color:0xffeccf
  });
  dustPts = new THREE.Points(g, m);
  dustPts.frustumCulled = false;
  scene.add(dustPts);
}

function updateDust(dt){
  if(!dustPts) return;
  var arr = dustPos, n = arr.length/3;
  var t = performance.now()*0.001;
  for(var i=0;i<n;i++){
    var k = i*3;
    // ゆっくり漂う。上下は正弦、水平はごく弱い流れ
    arr[k]   += Math.sin(t*0.21 + i)*0.0016 + dt*0.02;
    arr[k+1] += Math.sin(t*0.33 + i*1.7)*0.0022;
    arr[k+2] += Math.cos(t*0.19 + i*0.7)*0.0016;
    /* 粒は世界座標に置いたままにする。
       箱ごとプレイヤーに追従させると、粒が体に張り付いて一緒に動き、
       歩いても景色が流れない＝空気があるように見えない。
       箱から出た粒だけを反対側へ回り込ませる。 */
    var dx = arr[k] - player.x;
    if(dx >  DUST_BOX) arr[k] -= DUST_BOX*2; else if(dx < -DUST_BOX) arr[k] += DUST_BOX*2;
    var dz = arr[k+2] - player.z;
    if(dz >  DUST_BOX) arr[k+2] -= DUST_BOX*2; else if(dz < -DUST_BOX) arr[k+2] += DUST_BOX*2;
    if(arr[k+1] > 2.7) arr[k+1] = 0.05; else if(arr[k+1] < 0) arr[k+1] = 2.6;
  }
  dustPts.geometry.attributes.position.needsUpdate = true;
  // 照らされていない埃は見えない。ランプの状態に合わせて濃さを変える
  var want = player.lamp ? 0.30 : 0.05;
  var mo = dustPts.material.opacity;
  dustPts.material.opacity = mo + (want - mo) * (1 - Math.pow(0.05, dt));
}

/* ---- 非常口から差す光 --------------------------------------------------
   扉が開いた瞬間、そこが目的地だと一目で分かってほしい。
   加算合成の円錐を扉から通路側へ寝かせて置く。体積光の代わりだが、
   暗い廊下ではこれで十分に「光が漏れている」に見える。 */
var exitShaft = null;
function buildExitShaft(){
  if(exitShaft){ scene.remove(exitShaft); exitShaft.geometry.dispose(); exitShaft.material.dispose(); exitShaft = null; }
  if(!QC.shaft || !world.exit) return;
  var geo = new THREE.ConeGeometry(1.45, 5.2, 12, 1, true);
  geo.translate(0, -2.6, 0);            // 頂点を原点に置く
  var mat = new THREE.MeshBasicMaterial({
    color:0xff5a4a, transparent:true, opacity:0.0, side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending, depthWrite:false
  });
  exitShaft = new THREE.Mesh(geo, mat);
  exitShaft.frustumCulled = false;
  scene.add(exitShaft);
}
function updateExitShaft(dt){
  if(!exitShaft || !world.exit) return;
  var open = world.exit.open;
  var want = open ? 0.16 + 0.05*Math.sin(performance.now()*0.0031) : 0;
  /* 円錐の中に入ると、加算合成の面が視界いっぱいを一様に持ち上げて
     「白い膜」になる（両面なので 2 枚ぶん重なる）。実際、扉に近づくだけで
     天井まで真っ白になっていた。近づいたら消す。
     光の筋は「離れて横から見る」ものなので、消えても不自然ではない。 */
  var exd = Math.sqrt(Math.pow(camera.position.x - world.exit.doorX, 2) +
                      Math.pow(camera.position.z - world.exit.doorZ, 2));
  want *= clamp((exd - 1.1)/2.2, 0, 1);
  var mo = exitShaft.material.opacity;
  exitShaft.material.opacity = mo + (want - mo) * (1 - Math.pow(0.1, dt));
  if(exitShaft.material.opacity < 0.002) return;
  exitShaft.position.set(world.exit.doorX, 2.15, world.exit.doorZ);
  // 扉の面から通路側へ倒す
  var dx = world.exit.x - world.exit.doorX, dz = world.exit.z - world.exit.doorZ;
  var l = Math.sqrt(dx*dx + dz*dz) || 1;
  exitShaft.rotation.set(0, Math.atan2(dx/l, dz/l), 0);
  exitShaft.rotateX(Math.PI/2 - 0.30);
}

/* ---- 非常灯の光柱 ---------------------------------------------------
   埃の舞う病棟なのに、空中を通っている光そのものが見えなかった。
   光が「当たった面」にしか存在しないので、部屋がどれも同じに見える。

   最初は懐中電灯に円錐を付けたが、頭に付いた灯りは視線と光軸が一致して
   いるので、光柱は原理的に見えない（実際ほとんど映らなかった）。
   横から見る光源＝天井の非常灯に付けるのが正しい。

   体積の計算はできないので、円錐の殻を 1 枚置いて、視線と面の角度から
   厚みを推し量る。視線に対して寝ている（＝縁の）ところほど光線が長く
   通るので明るくする。両面を加算で重ねると中心が明るく縁がにじむ
   ——実際の散乱と同じ見え方になる。

   深度テストは有効にする。壁で切られてくれないと隣の部屋まで伸びる。 */
var lampShafts = [];
function buildLampShafts(){
  for(var i=0;i<lampShafts.length;i++){
    var o = lampShafts[i];
    scene.remove(o); o.geometry.dispose(); o.material.dispose();
  }
  lampShafts = [];
  if(!QC.shaft) return;
  var H = WALL_H - 0.16, RAD = 1.55;
  var CSEG = QC.detail ? 26 : 16;
  var geo = new THREE.ConeGeometry(RAD, H, CSEG, 3, true);
  geo.translate(0, -H/2, 0);                 // 頂点を原点（灯具の位置）へ
  /* 外側にもう一枚、少し広くて薄い殻を重ねる。殻が 1 枚だと円錐の
     側面がそのまま光の境界になり、天井から床へ落ちる硬い三角形に
     見えていた（実際そう見えた）。実際の光の縁は半影でぼやける。
     2 段に分けるだけで境目が消える。頂点は 2 倍になるが、
     出るのは電源を入れた区画の 4 灯だけ。 */
  var geoOut = new THREE.ConeGeometry(RAD*1.34, H, CSEG, 3, true);
  geoOut.translate(0, -H/2, 0);
  var vs = [
    'varying vec3 vN; varying vec3 vV; varying float vY;',
    'void main(){',
    '  vY = position.y;',
    '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
    '  vN = normalize(normalMatrix * normal);',
    '  vV = normalize(-mv.xyz);',
    '  gl_Position = projectionMatrix * mv;',
    '}'
  ].join('\n');
  var fs = [
    'uniform vec3 uColor; uniform float uAmt, uLen, uTime;',
    'varying vec3 vN; varying vec3 vV; varying float vY;',
    'void main(){',
    /* 視線と面の角度。寝ているほど光線が長く通る＝厚い */
    '  float rim = 1.0 - abs(dot(normalize(vN), normalize(vV)));',
    /* 向きが逆だった。殻の面が視線に対して寝ているのは「円錐の輪郭」で、
       そこを最大にすると輪郭だけが光る＝天井から落ちる硬い三角形になる。
       実際に光が満ちているのは円錐の中身で、視線が貫く距離は中心で
       最長・輪郭でゼロ。つまり正面を向いている面ほど厚い。
       |dot(N,V)| をそのまま使えば、縁は自然に 0 へ落ちて境目が消える。 */
    '  float thick = pow(clamp(1.0 - rim, 0.0, 1.0), 1.6);',
    '  float t = clamp(-vY / uLen, 0.0, 1.0);',        // 0=灯具 1=床
    '  float nearK = smoothstep(0.02, 0.16, t);',      // 灯具の真下は絞る
    '  float farK  = 1.0 - smoothstep(0.35, 1.0, t);', // 下ほど散って消える
    '  float n = 0.86 + 0.14*sin(vY*5.0 + uTime*0.8);',
    '  gl_FragColor = vec4(uColor, uAmt * thick * nearK * farK * n);',
    '}'
  ].join('\n');
  for(var k=0; k<Math.min(QC.lamps, 4); k++){
    var mat = new THREE.ShaderMaterial({
      uniforms:{ uColor:{ value:new THREE.Color(0xffb75a) }, uAmt:{ value:0 },
                 uLen:{ value:H }, uTime:{ value:0 } },
      vertexShader:vs, fragmentShader:fs,
      transparent:true, blending:THREE.AdditiveBlending,
      depthWrite:false, depthTest:true, side:THREE.DoubleSide
    });
    var m = new THREE.Mesh(geo, mat);
    m.visible = false; m.renderOrder = 5;
    var mo = new THREE.Mesh(geoOut, mat.clone());
    mo.material.uniforms.uColor.value = new THREE.Color(0xffb75a);
    mo.visible = false; mo.renderOrder = 4;
    m.add(mo);                                 // 内側の殻に付けて一緒に動かす
    m.userData.outer = mo;
    scene.add(m);
    lampShafts.push(m);
  }
}
/* 非常灯のカリング（lightPool）と同じ並びで駆動する。
   点いていない灯には光柱も出さない。 */
function updateLampShafts(dt){
  for(var i=0;i<lampShafts.length;i++){
    var m = lampShafts[i], pl = lightPool[i];
    var u = m.material.uniforms;
    u.uTime.value += dt;
    var on = pl && pl.intensity > 0.02 && pl.visible;
    var want = on ? clamp(pl.intensity, 0, 2) * 0.115 : 0;
    // 非常口の光柱と同じ理由。灯の真下に入ったら消す
    if(on){
      var lpd = Math.sqrt(Math.pow(camera.position.x - pl.position.x, 2) +
                          Math.pow(camera.position.z - pl.position.z, 2));
      want *= clamp((lpd - 0.7)/1.5, 0, 1);
    }
    u.uAmt.value += (want - u.uAmt.value) * (1 - Math.pow(0.0008, dt));
    m.visible = u.uAmt.value > 0.004;
    // 外側の薄い殻。半影ぶんなので内側の 1/3 の濃さで追従させる
    var mo = m.userData.outer;
    if(mo){
      mo.material.uniforms.uAmt.value = u.uAmt.value * 0.34;
      mo.material.uniforms.uTime.value = u.uTime.value;
      mo.visible = m.visible;
    }
    // 光柱の頂点は器具の底に合わせる（0.10 だと器具との間に隙間が出る）
    if(m.visible && pl) m.position.set(pl.position.x, pl.position.y + 0.23, pl.position.z);
  }
}

/* ---- ポストプロセス（色収差・ノイズ・走査線・歪み） ----
   EffectComposer は three r128 の配布ファイルに含まれないため、
   レンダーターゲット＋フルスクリーンシェーダで同等の処理を自前で行う */
var postRT = null, postScene = null, postCam = null, postMat = null;
var postFX = { aberr:0, noise:0, scan:0, warp:0, target:{ aberr:0, noise:0, scan:0, warp:0 } };

/* ブルーム（光の滲み）。
   この病棟の光源は誘導灯・ランプ・拾い物の発光しかなく、どれも暗闇の中で
   点にしか見えていなかった。滲みが無いと「光っている」ではなく
   「明るい点が描いてある」に見える。

   EffectComposer が使えないので、1/4 の大きさのバッファを 2 枚だけ使って
   明るい所を抜き出す → 横にぼかす → 縦にぼかす、を自前で回す。
   縮小してあるので 9 タップでも十分に広がる。最高品質でのみ通す。 */
var bloomA = null, bloomB = null, brightMat = null, blurMat = null, bloomQuad = null;

function buildPost(){
  var size = new THREE.Vector2();
  renderer.getDrawingBufferSize(size);
  postRT = new THREE.WebGLRenderTarget(Math.max(1,size.x), Math.max(1,size.y), {
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat, stencilBuffer: false, depthBuffer: true
  });
  postRT.texture.colorSpace = THREE.SRGBColorSpace;   // 本編と同じ発色でRTに描く
  /* r155 以降の three はトーンマップと sRGB 化を画面へ描くときにしか掛けず、
     RT には線形のまま書く。そのまま r186 に上げたら、ここを通る高画質側だけ
     画面が 1/4 の明るさ（平均輝度 57.9 → 15.9）に沈んだ。
     three が「画面と同じ扱い」をする目印が isXRRenderTarget で、立てると
     r128 と同じく ACES と sRGB を掛けて書く。
     ただし sRGB の RT は GPU が書くときにもう一度符号化し、読むときに戻す。
     それを避けて入れ物は素の RGBA8 にする。これで「符号化済みの値を 8bit で
     持ち、そのまま読む」という r128 の流れと 1 対 1 になる（平均輝度 58.0、r128 は 57.9）。 */
  postRT.isXRRenderTarget = true;
  postRT.texture.internalFormat = 'RGBA8';
  /* 深度を読めるようにしておく。光の筋と接地の陰（第 8.2 節）は、本編を描いた直後の
     深度から作る。手（viewScene）は深度を消してから描くので、合成の時点のこの深度は
     「手の在る所だけ値が入り、他は 1.0」になる。それを手の型抜きにも使う。 */
  postRT.depthTexture = new THREE.DepthTexture(Math.max(1,size.x), Math.max(1,size.y));
  postRT.depthTexture.type = THREE.UnsignedIntType;

  postScene = new THREE.Scene();
  postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  postMat = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: postRT.texture },
      uRes:   { value: new THREE.Vector2(size.x, size.y) },
      uTime:  { value: 0 },
      uAberr: { value: 0 },
      uNoise: { value: 0 },
      uScan:  { value: 0 },
      uWarp:  { value: 0 },
      tBloom: { value: null },
      uBloom: { value: 0 },
      uSharp: { value: 0 },
      tDepth: { value: postRT.depthTexture },
      tFx:    { value: null },
      uFx:    { value: 0 },
      uHands: { value: 0 },
      uAA:    { value: 0 },
      uDof:   { value: 0 },
      tRaw:   { value: postRT.texture },
      uTaa:   { value: 0 }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform sampler2D tDiffuse;',
      'uniform vec2 uRes;',
      'uniform float uTime, uAberr, uNoise, uScan, uWarp, uBloom, uSharp, uFx, uHands, uAA, uDof;',
      'uniform sampler2D tBloom, tDepth, tFx, tRaw;',
      'uniform float uTaa;',
      'varying vec2 vUv;',
      'float luma(vec3 c){ return dot(c, vec3(0.299, 0.587, 0.114)); }',
      /* 輪郭の均し（FXAA 3.11 の軽い版）。斜めの 4 点で輪郭の向きを出し、その向きに
         沿って 2〜4 点を平均する。差の小さい所（画面の大半）はすぐ抜ける。
         細い配管・格子・手すりのぎざぎざとちらつきが消える。 */
      'vec3 fxaa(vec2 uv){',
      '  vec2 tx = 1.0 / uRes;',
      '  vec3 cM = texture2D(tDiffuse, uv).rgb;',
      '  float lNW = luma(texture2D(tDiffuse, uv + vec2(-1.0,-1.0)*tx).rgb);',
      '  float lNE = luma(texture2D(tDiffuse, uv + vec2( 1.0,-1.0)*tx).rgb);',
      '  float lSW = luma(texture2D(tDiffuse, uv + vec2(-1.0, 1.0)*tx).rgb);',
      '  float lSE = luma(texture2D(tDiffuse, uv + vec2( 1.0, 1.0)*tx).rgb);',
      '  float lM = luma(cM);',
      '  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE)));',
      '  float lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));',
      '  if(lMax - lMin < max(0.0312, lMax * 0.125)) return cM;',
      '  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));',
      '  float red = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);',
      '  float rcp = 1.0 / (min(abs(dir.x), abs(dir.y)) + red);',
      '  dir = clamp(dir * rcp, -8.0, 8.0) * tx;',
      '  vec3 a = 0.5 * (texture2D(tDiffuse, uv + dir * (1.0/3.0 - 0.5)).rgb + texture2D(tDiffuse, uv + dir * (2.0/3.0 - 0.5)).rgb);',
      '  vec3 b = a * 0.5 + 0.25 * (texture2D(tDiffuse, uv - dir * 0.5).rgb + texture2D(tDiffuse, uv + dir * 0.5).rgb);',
      '  float lb = luma(b);',
      '  return (lb < lMin || lb > lMax) ? a : b;',
      '}',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      /* 交互勾配ノイズ。整列した点が画面全体に均一に散るので、
         同じ 1 個の乱数でも sin ベースの hash より粒が揃う。
         最後の量子化誤差をばらすためだけに使う。 */
      'float ign(vec2 p){',
      '  return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715))));',
      '}',
      'void main(){',
      '  vec2 c = vUv - 0.5;',
      '  float r2 = dot(c, c);',
      '  vec2 uv = 0.5 + c * (1.0 + uWarp * r2 * 1.9);',       // 樽型の歪み
      '  float bandPos = fract(uv.y * 0.6 - uTime * 0.11);',
      '  float band = smoothstep(0.0, 0.05, bandPos) * smoothstep(0.13, 0.05, bandPos);',
      '  uv.x += band * uScan * 0.016 * (hash(vec2(uTime * 11.0, floor(uv.y * 120.0))) - 0.5);',
      '  uv = clamp(uv, 0.0005, 0.9995);',
      /* 色収差。中心からの距離に線形で掛けていたが、実際のレンズの倍率色収差は
         おおむね像高の二乗で効く。線形だと画面中央寄りにも残り、常時映っている
         手の輪郭が 8px ほど色ズレして「post の副作用」に見えていた。
         r2 を掛け、係数を 0.022→0.044 にして四隅の強さは元のまま揃える
         （四隅 |c|=0.707: 旧 0.707×0.022=0.01556、新 0.707×0.5×0.044=0.01555）。
         手のあたり |c|=0.26 では 0.0057 → 0.0004 と 15 分の 1 になる。 */
      '  vec2 d = c * (uAberr * 0.044 * r2 + band * uScan * 0.005);', // 色収差
      '  vec3 col;',
      '  if(uAA > 0.5){',
      '    col = fxaa(uv);',
      '    if(dot(d, d) > 1e-10){',
      '      col.r = texture2D(tDiffuse, clamp(uv + d, 0.0005, 0.9995)).r;',
      '      col.b = texture2D(tDiffuse, clamp(uv - d, 0.0005, 0.9995)).b;',
      '    }',
      '  }else{',
      '    col.r = texture2D(tDiffuse, clamp(uv + d, 0.0005, 0.9995)).r;',
      '    col.g = texture2D(tDiffuse, uv).g;',
      '    col.b = texture2D(tDiffuse, clamp(uv - d, 0.0005, 0.9995)).b;',
      '  }',
      /* 輪郭の持ち上げ。端末の画素密度より低い解像度で描いて引き伸ばす
         設定があるので、そのままだと全体がふやける。上下左右 4 点との
         差を足し戻すと輪郭が戻る。ただし素の差を足すと縁が白く光る
         （リンギング）ので、近傍の最小最大で挟んで抑える。
         uSharp が 0 の品質では一様分岐なので実行されない。 */
      '  if(uSharp > 0.0){',
      '    vec2 tx = 1.0 / uRes;',
      '    vec3 s1 = texture2D(tDiffuse, clamp(uv + vec2(tx.x, 0.0), 0.0005, 0.9995)).rgb;',
      '    vec3 s2 = texture2D(tDiffuse, clamp(uv - vec2(tx.x, 0.0), 0.0005, 0.9995)).rgb;',
      '    vec3 s3 = texture2D(tDiffuse, clamp(uv + vec2(0.0, tx.y), 0.0005, 0.9995)).rgb;',
      '    vec3 s4 = texture2D(tDiffuse, clamp(uv - vec2(0.0, tx.y), 0.0005, 0.9995)).rgb;',
      '    vec3 lo = min(min(s1, s2), min(s3, s4));',
      '    vec3 hi = max(max(s1, s2), max(s3, s4));',
      '    vec3 sh = col + (col * 4.0 - (s1 + s2 + s3 + s4)) * (uSharp * 0.25);',
      '    col = clamp(sh, min(lo, col), max(hi, col));',
      '  }',
      /* 読む間の背景ぼかし（被写界深度の代わり）。紙に目が行っている間だけ、
         円盤状の 8 点で奥をぼかす。手は深度で型抜きしてぼかさない */
      '  float nh = (uHands > 0.5) ? step(0.99999, texture2D(tDepth, uv).r) : 1.0;',
      /* TAA を通した絵には手が入っていない（手は後から別に描く）。手の所は生の絵へ戻す */
      '  if(uTaa > 0.5 && nh < 0.5) col = texture2D(tRaw, uv).rgb;',
      '  if(uDof > 0.002){',
      '    vec2 rr = (uDof * 5.0) / uRes;',
      '    vec3 bl = col;',
      '    for(int i = 0; i < 8; i++){',
      '      float an = float(i) * 0.785398 + 0.39;',
      '      bl += texture2D(tDiffuse, clamp(uv + vec2(cos(an), sin(an)) * rr * (i < 4 ? 1.0 : 0.55), 0.0005, 0.9995)).rgb;',
      '    }',
      '    col = mix(col, bl / 9.0, clamp(uDof, 0.0, 1.0) * nh);',
      '  }',
      /* 光の筋（rgb）と接地の陰（a）。1/2 の大きさで作ってあるのを引き伸ばして重ねる */
      '  if(uFx > 0.5){',
      '    vec4 fx = texture2D(tFx, uv);',
      '    col = col * mix(1.0, fx.a, nh) + fx.rgb * nh;',
      '  }',
      '  float sl = sin(uv.y * uRes.y * 1.5) * 0.5 + 0.5;',      // 走査線
      '  col *= 1.0 - uScan * 0.20 * sl;',
      '  col *= 1.0 - band * uScan * 0.25;',
      '  float n = hash(uv * uRes * 0.6 + vec2(uTime * 91.0, uTime * 47.0));',
      '  col += (n - 0.5) * uNoise;',                            // 粒子ノイズ
      '  col += texture2D(tBloom, uv).rgb * uBloom;',        // 光の滲み
      // 色調整。暗部をわずかに青緑へ持ち上げ、明部の伸びを寝かせる。
      // 真っ黒が本当に 0 だと、暗い画面が「消えている」ように見える
      /* ここはレンダラの ACES の後段なので、実質トーンマップが二重に
         掛かっている。0.28（さらに 0.44）では中間調の持ち上げが強すぎて、
         線形 0.25 が 0.49 まで上がり、壁も小物も一様に白く寝ていた。
         k を上げるほど直線に近づく。1.05 で「暗部は沈み、明部だけ丸まる」。 */
      '  col = col / (col + vec3(1.05)) * 1.95;',
      '  col += vec3(0.004, 0.011, 0.010) * (1.0 - smoothstep(0.0, 0.30, col));',
      /* 明暗で色を振り分ける。暗部を青緑へ寄せるのは前からやっていたが、
         明部が無彩色のままだと、非常灯もランプも同じ白い塊に見えていた。
         明るい所だけ暖色へ倒すと、光源が「灯り」として立つ。 */
      '  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));',
      '  col = mix(col, col * vec3(1.045, 0.995, 0.930), smoothstep(0.42, 0.95, lum));',
      // 周辺減光。四隅を落とすと視線が中央に集まり、暗さの中で奥行きが出る
      '  col *= 1.0 - (0.34 + uWarp * 0.55) * r2;',
      /* 量子化のばらし。暗い場面ばかりなので、8bit に落とすところで
         濃淡の段（バンディング）が同心円状にはっきり出ていた。
         ±半階調だけずらすと段が消え、粒に化ける。粒子ノイズとは別物で、
         こちらは常時・振幅固定。 */
      '  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;',
      '  gl_FragColor = vec4(max(col, 0.0), 1.0);',
      '}'
    ].join('\n'),
    depthTest: false, depthWrite: false
  });
  var quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
  quad.frustumCulled = false;
  postScene.add(quad);

  if(QC.bloom) buildBloom(size);
}

// 品質が落ちたら滲みのバッファも返す（VRAM を握ったままにしない）
function dropBloom(){
  if(bloomA){ bloomA.dispose(); bloomA = null; }
  if(bloomB){ bloomB.dispose(); bloomB = null; }
}

function buildBloom(size){
  var bw = Math.max(1, Math.floor(size.x/4)), bh = Math.max(1, Math.floor(size.y/4));
  var opt = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
              format:THREE.RGBAFormat, stencilBuffer:false, depthBuffer:false };
  bloomA = new THREE.WebGLRenderTarget(bw, bh, opt);
  bloomB = new THREE.WebGLRenderTarget(bw, bh, opt);
  var VS = ['varying vec2 vUv;',
            'void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }'].join('\n');
  // 明るい所だけを抜く。閾値より下は捨て、上は滑らかに立ち上げる
  brightMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse:{ value:null }, uThresh:{ value:0.74 } },
    vertexShader: VS,
    fragmentShader: ['uniform sampler2D tDiffuse; uniform float uThresh; varying vec2 vUv;',
      'void main(){',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  float k = smoothstep(uThresh, uThresh + 0.35, l);',
      '  gl_FragColor = vec4(c * k, 1.0);',
      '}'].join('\n'),
    depthTest:false, depthWrite:false });
  // 分離ブラー。横と縦で 2 回通す（2次元で回すより格段に安い）
  blurMat = new THREE.ShaderMaterial({
    uniforms: { tDiffuse:{ value:null }, uDir:{ value:new THREE.Vector2(1,0) },
                uTexel:{ value:new THREE.Vector2(1/bw, 1/bh) } },
    vertexShader: VS,
    fragmentShader: ['uniform sampler2D tDiffuse; uniform vec2 uDir, uTexel; varying vec2 vUv;',
      'void main(){',
      '  vec2 o = uDir * uTexel;',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.227027;',
      '  c += texture2D(tDiffuse, vUv + o*1.3846).rgb * 0.316216;',
      '  c += texture2D(tDiffuse, vUv - o*1.3846).rgb * 0.316216;',
      '  c += texture2D(tDiffuse, vUv + o*3.2308).rgb * 0.070270;',
      '  c += texture2D(tDiffuse, vUv - o*3.2308).rgb * 0.070270;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n'),
    depthTest:false, depthWrite:false });
  bloomQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), brightMat);
  bloomQuad.frustumCulled = false;
}

/* ---- 光の筋と接地の陰（設計指示書 第 8.2 節） ----
   本編を描いた直後の深度から、1/2 の大きさで 1 枚に作る（rgb＝光の筋、a＝陰の濃さ）。

   光の筋：ランプは目の位置にあるので、画面の 1 画素の視線の上の点は、どれも
   ランプの軸から同じ角度にある。だから視線に沿って散乱を積む計算が閉じた式になる：
     散乱 = 円錐の中か（角度だけで決まる） × ∫0..D 1/(1+(t/r)^2) dt = r·atan(D/r)
   D は視線が物に当たるまでの距離。長い廊下の奥を照らすと光の筋が濃く、壁に
   近づけると薄くなる。埃のむらはゆっくり流れる値ノイズで足す。

   接地の陰：深度だけで作る（法線は持たない）。深度をそのまま比べると、斜めに
   見ている床が一面に暗くなる。周りの深度から「平らならここはこの深さ」を
   1/z の平面で予想し、それより手前に在る分だけを陰にする。 */
var fxRT = null, fxMat = null, fxScene = null;
function fxWant(){
  var beam = QC.beam && settings.fxBeam && playAs !== 'hunter';
  var ao = QC.ssao && settings.fxAO;
  return { beam:!!beam, ao:!!ao, any:!!(beam || ao) };
}
function buildFx(size){
  var w = Math.max(1, Math.floor(size.x/2)), h = Math.max(1, Math.floor(size.y/2));
  fxRT = new THREE.WebGLRenderTarget(w, h, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter,
    format:THREE.RGBAFormat, stencilBuffer:false, depthBuffer:false });
  fxMat = new THREE.ShaderMaterial({
    uniforms: {
      tDepth:{ value:postRT.depthTexture }, uRes:{ value:new THREE.Vector2(w, h) },
      uNear:{ value:0.05 }, uFar:{ value:200 }, uTan:{ value:new THREE.Vector2(1, 1) },
      uDir:{ value:new THREE.Vector3(0, 0, -1) }, uCosOut:{ value:0.9 }, uCosIn:{ value:0.95 },
      uCol:{ value:new THREE.Vector3() }, uR:{ value:3.2 }, uRange:{ value:28 },
      uTime:{ value:0 }, uBeam:{ value:0 }, uAO:{ value:0 }
    },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDepth; uniform vec2 uRes, uTan; uniform float uNear, uFar, uCosOut, uCosIn, uR, uRange, uTime, uBeam, uAO;',
      'uniform vec3 uDir, uCol; varying vec2 vUv;',
      'float lz(float d){ float z = d * 2.0 - 1.0; return 2.0 * uNear * uFar / (uFar + uNear - z * (uFar - uNear)); }',
      'float hsh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
      'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);',
      '  return mix(mix(hsh(i), hsh(i+vec2(1.0,0.0)), f.x), mix(hsh(i+vec2(0.0,1.0)), hsh(i+vec2(1.0,1.0)), f.x), f.y); }',
      'float ign(vec2 p){ return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }',
      'void main(){',
      '  float d = texture2D(tDepth, vUv).r;',
      '  float z = lz(d);',
      '  bool sky = d >= 0.99999;',
      '  vec3 ray = vec3((vUv * 2.0 - 1.0) * uTan, -1.0);',
      '  float rl = length(ray); vec3 rd = ray / rl;',
      '  vec3 beam = vec3(0.0);',
      '  if(uBeam > 0.0){',
      '    float D = sky ? uRange : min(z * rl, uRange);',
      '    float c = dot(rd, uDir);',
      '    float spot = smoothstep(uCosOut, uCosIn, c) + 0.18 * smoothstep(uCosOut - 0.06, uCosOut, c);',
      '    float I = atan(D / uR) / 1.5708;',
      '    float asp = uRes.x / uRes.y;',
      '    float dust = vn(vUv * vec2(asp, 1.0) * 5.0 + vec2(uTime * 0.035, -uTime * 0.05))',
      '               * 0.6 + vn(vUv * vec2(asp, 1.0) * 13.0 - vec2(uTime * 0.07, uTime * 0.02)) * 0.4;',
      '    beam = uCol * (spot * I * (0.62 + 0.76 * dust)) * uBeam;',
      '    beam += (ign(gl_FragCoord.xy) - 0.5) / 255.0;',
      '  }',
      '  float ao = 1.0;',
      '  if(uAO > 0.5 && !sky && z < 18.0){',
      /* 深度は最近傍で読まれる。ずらした先を画素の中心へ寄せ、平面の予想にも寄せた後の
         ずれを使う。寄せないと、斜めに見る床や天井で「読んだ所」と「予想した所」が
         半画素ずれ、縞状の偽の陰が出た */
      '    vec2 dres = uRes * 2.0, tx = 1.0 / dres;',
      '    vec2 c0 = (floor(vUv * dres) + 0.5) * tx;',
      '    float w0 = 1.0 / lz(texture2D(tDepth, c0).r);',
      '    float wr = 1.0 / lz(texture2D(tDepth, c0 + vec2(tx.x, 0.0)).r), wl = 1.0 / lz(texture2D(tDepth, c0 - vec2(tx.x, 0.0)).r);',
      '    float wu = 1.0 / lz(texture2D(tDepth, c0 + vec2(0.0, tx.y)).r), wd = 1.0 / lz(texture2D(tDepth, c0 - vec2(0.0, tx.y)).r);',
      /* 段差をまたいだ差分を使うと平面の予想が狂うので、左右（上下）の小さい方を採る */
      '    float gx = abs(wr - w0) < abs(w0 - wl) ? (wr - w0) : (w0 - wl);',
      '    float gy = abs(wu - w0) < abs(w0 - wd) ? (wu - w0) : (w0 - wd);',
      '    vec2 rUV = vec2(0.42 / (2.0 * uTan.x * z), 0.42 / (2.0 * uTan.y * z));',
      '    rUV = min(rUV, vec2(0.08));',
      '    float rot = ign(gl_FragCoord.xy) * 6.2832, occ = 0.0;',
      '    for(int i = 0; i < 8; i++){',
      '      float fi = float(i);',
      '      float an = fi * 2.39996 + rot, rr = (fi + 0.5) / 8.0;',
      '      vec2 sp = (floor((c0 + vec2(cos(an), sin(an)) * rr * rUV) * dres) + 0.5) * tx;',
      '      vec2 o = sp - c0;',
      '      float zs = lz(texture2D(tDepth, sp).r);',
      '      float wp = w0 + gx * (o.x / tx.x) + gy * (o.y / tx.y);',
      '      float zp = 1.0 / max(wp, 1e-4);',
      '      float df = zp - zs;',
      '      occ += smoothstep(0.03, 0.14, df) * (1.0 - smoothstep(0.35, 0.8, df));',
      '    }',
      '    ao = 1.0 - (occ / 8.0) * 0.62 * (1.0 - smoothstep(10.0, 18.0, z));',
      '  }',
      '  gl_FragColor = vec4(max(beam, 0.0), ao);',
      '}'
    ].join('\n'),
    depthTest:false, depthWrite:false });
  fxScene = new THREE.Scene();
  var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fxMat); q.frustumCulled = false;
  fxScene.add(q);
}
function dropFx(){ if(fxRT){ fxRT.dispose(); fxRT = null; } }
var _fxTmp = null;
/* 本編を postRT に描いた直後（手を描く前）に呼ぶ。作ったら true */
function renderFx(dt){
  var fw = fxWant();
  if(!postRT || !fw.any){ if(fxRT) dropFx(); return false; }
  if(!fxRT || !fxMat){ var sz = new THREE.Vector2(); renderer.getDrawingBufferSize(sz); buildFx(sz); }
  var u = fxMat.uniforms;
  u.uNear.value = camera.near; u.uFar.value = camera.far;
  var ty = Math.tan(camera.fov * Math.PI / 360);
  u.uTan.value.set(ty * camera.aspect, ty);
  u.uTime.value += dt;
  u.uAO.value = fw.ao ? 1 : 0;
  var bi = (fw.beam && flashlight && flashlight.visible) ? flashlight.intensity / LAMP_I : 0;
  u.uBeam.value = clamp(bi, 0, 1.5);
  if(bi > 0){
    u.uDir.value.set(viewBeam.x, viewBeam.y, -1).normalize();
    u.uCosOut.value = Math.cos(flashlight.angle * 1.05);
    u.uCosIn.value = Math.cos(flashlight.angle * (1 - flashlight.penumbra * 0.8));
    u.uRange.value = flashlight.distance || 28;
    // 暖かい白。露出の自動追従の後段で足すので、明るさは控えめな固定値
    u.uCol.value.set(0.080, 0.066, 0.046);
  }
  renderer.setRenderTarget(fxRT);
  renderer.render(fxScene, postCam);
  renderer.setRenderTarget(postRT);
  return true;
}

/* ---- 時間方向の輪郭の均し（TAA。設計指示書 第 8.2 節「推奨端末は時間方向」） ----
   毎フレーム、投影を 1 画素未満だけずらして描き（Halton 2,3 の 8 通り）、前のフレームの
   結果と混ぜる。前の結果は、深度から「この画素は前のフレームでは画面のどこに在ったか」を
   逆算して読む（カメラの動きはこれで吸収される）。動く物（あれ）の尾引きは、今の画素の
   周り 3×3 の明暗の幅に前の値を押し込めて抑える。速く振り向いた所は今の値を重くする。
   手は別の視点で描くので混ぜない（深度の型抜きで最終合成が生の値に戻す）。最高品質のみ。 */
var taaA = null, taaB = null, taaMat = null, taaScene = null, taaPrevVP = null, taaN = 0, taaReset = true;
var taaPrevPos = null, _taaM = null, _taaInv = null;
function taaWant(){ return !!(QC.bloom && settings.fxAA && postRT); }
function halton(i, b){ var f = 1, r = 0; while(i > 0){ f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; }
function buildTaa(size){
  var opt = { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat,
              stencilBuffer:false, depthBuffer:false };
  taaA = new THREE.WebGLRenderTarget(Math.max(1,size.x), Math.max(1,size.y), opt);
  taaB = new THREE.WebGLRenderTarget(Math.max(1,size.x), Math.max(1,size.y), opt);
  taaMat = new THREE.ShaderMaterial({
    uniforms: { tCur:{ value:postRT.texture }, tDepth:{ value:postRT.depthTexture }, tHist:{ value:null },
                uToPrev:{ value:new THREE.Matrix4() }, uRes:{ value:new THREE.Vector2(size.x, size.y) },
                uReset:{ value:1 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tCur, tDepth, tHist; uniform mat4 uToPrev; uniform vec2 uRes; uniform float uReset;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 tx = 1.0 / uRes;',
      '  vec3 c = texture2D(tCur, vUv).rgb;',
      '  if(uReset > 0.5){ gl_FragColor = vec4(c, 1.0); return; }',
      '  vec3 mn = c, mx = c;',
      '  for(int j = -1; j <= 1; j++) for(int i = -1; i <= 1; i++){',
      '    if(i == 0 && j == 0) continue;',
      '    vec3 s = texture2D(tCur, vUv + vec2(float(i), float(j)) * tx).rgb;',
      '    mn = min(mn, s); mx = max(mx, s);',
      '  }',
      '  float d = texture2D(tDepth, vUv).r;',
      '  vec4 p = uToPrev * vec4(vUv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);',
      '  vec2 pv = p.xy / p.w * 0.5 + 0.5;',
      '  if(p.w <= 0.0 || pv.x < 0.0 || pv.y < 0.0 || pv.x > 1.0 || pv.y > 1.0){ gl_FragColor = vec4(c, 1.0); return; }',
      '  vec3 h = clamp(texture2D(tHist, pv).rgb, mn, mx);',
      '  float vel = length((pv - vUv) * uRes);',
      '  float a = mix(0.12, 0.4, clamp(vel / 14.0, 0.0, 1.0));',
      '  gl_FragColor = vec4(mix(h, c, a), 1.0);',
      '}'
    ].join('\n'),
    depthTest:false, depthWrite:false });
  taaScene = new THREE.Scene();
  var q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), taaMat); q.frustumCulled = false;
  taaScene.add(q);
  taaPrevVP = new THREE.Matrix4(); _taaM = new THREE.Matrix4(); _taaInv = new THREE.Matrix4();
  taaPrevPos = new THREE.Vector3(); taaReset = true;
}
function dropTaa(){
  if(taaA){ taaA.dispose(); taaB.dispose(); taaA = taaB = null; }
  taaReset = true;
}
/* 本編を描く直前：投影を少しずらす。戻り値は TAA を通すかどうか */
function taaJitter(){
  if(!taaWant()){ if(taaA) dropTaa(); return false; }
  if(!taaA){ var sz = new THREE.Vector2(); renderer.getDrawingBufferSize(sz); buildTaa(sz); }
  taaN = (taaN + 1) % 8;
  var w = taaMat.uniforms.uRes.value.x, h = taaMat.uniforms.uRes.value.y;
  var jx = (halton(taaN + 1, 2) - 0.5) * 2 / w, jy = (halton(taaN + 1, 3) - 0.5) * 2 / h;
  camera.updateProjectionMatrix();
  camera.projectionMatrix.elements[8] += jx;
  camera.projectionMatrix.elements[9] += jy;
  camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
  return true;
}
/* 本編を描いた直後（手を描く前）：前の結果と混ぜる。戻り値は混ぜた結果のテクスチャ */
function taaResolve(){
  var u = taaMat.uniforms;
  // 瞬間移動（始まり・復活・大きな跳び）の直後は前の結果を捨てる
  if(taaPrevPos.distanceToSquared(camera.position) > 4) taaReset = true;
  _taaInv.copy(camera.projectionMatrix).invert();
  _taaM.copy(taaPrevVP).multiply(camera.matrixWorld).multiply(_taaInv);
  u.uToPrev.value.copy(_taaM);
  u.uReset.value = taaReset ? 1 : 0;
  u.tHist.value = taaB.texture;
  renderer.setRenderTarget(taaA);
  renderer.render(taaScene, postCam);
  var t = taaA; taaA = taaB; taaB = t;          // 今の結果は taaB。次のフレームの「前」になる
  taaPrevVP.copy(camera.projectionMatrix).multiply(camera.matrixWorldInverse);
  taaPrevPos.copy(camera.position);
  taaReset = false;
  camera.updateProjectionMatrix();              // ずらしを戻す（当たり判定や他の描画に残さない）
  renderer.setRenderTarget(postRT);
  return taaB.texture;
}

/* 明るい所を抜いて 2 回ぼかす。戻り値を最終合成が読む */
function renderBloom(){
  if(!postRT) return null;
  // 品質は遊んでいる途中でも変わる（設定・自動降格）。要るときに作る
  if(!bloomA){
    var bsz = new THREE.Vector2(); renderer.getDrawingBufferSize(bsz);
    buildBloom(bsz);
  }
  var sc = new THREE.Scene(); sc.add(bloomQuad);
  bloomQuad.material = brightMat;
  brightMat.uniforms.tDiffuse.value = postRT.texture;
  renderer.setRenderTarget(bloomA); renderer.render(sc, postCam);
  bloomQuad.material = blurMat;
  blurMat.uniforms.tDiffuse.value = bloomA.texture;
  blurMat.uniforms.uDir.value.set(1, 0);
  renderer.setRenderTarget(bloomB); renderer.render(sc, postCam);
  blurMat.uniforms.tDiffuse.value = bloomB.texture;
  blurMat.uniforms.uDir.value.set(0, 1);
  renderer.setRenderTarget(bloomA); renderer.render(sc, postCam);
  return bloomA.texture;
}

function postEnabled(){ return !!(postRT && QC.post); }

function updatePost(dt){
  if(!postMat) return;
  var panic = 1 - player.sanity/100;
  var hurt = clamp(player.hurtT / 0.5, 0, 1);
  var chase = (hunter.mode === 'chase') ? 1 : 0;
  var T = postFX.target;
  T.aberr = 0.05 + panic*1.15 + hurt*2.6 + chase*0.18;
  T.noise = 0.028 + panic*0.16 + hurt*0.22;
  T.scan  = 0.12 + panic*0.55 + hurt*0.35;
  T.warp  = 0.015 + panic*0.28 + hurt*0.30;
  // ダメージは立ち上がりを速く、収まりをゆっくり
  var k = 1 - Math.pow(hurt > 0.01 ? 0.0005 : 0.02, dt);
  // 画面の揺れ（設定）。歪み・走査線・色ずれも「揺れ」として一緒に絞る
  T.aberr *= settings.motion; T.scan *= settings.motion; T.warp *= settings.motion;
  if(cheats.noShake){ T.aberr = 0; T.noise = 0.01; T.scan = 0; T.warp = 0; player.shake = 0; }
  postFX.aberr = lerp(postFX.aberr, T.aberr, k);
  postFX.noise = lerp(postFX.noise, T.noise, k);
  postFX.scan  = lerp(postFX.scan,  T.scan,  k);
  postFX.warp  = lerp(postFX.warp,  T.warp,  k);
  var u = postMat.uniforms;
  u.uTime.value += dt;
  u.uAberr.value = postFX.aberr;
  u.uNoise.value = postFX.noise;
  u.uScan.value  = postFX.scan;
  u.uWarp.value  = postFX.warp;
  /* 輪郭の持ち上げ量。端末の画素密度を品質ごとの上限で切っているので、
     切られた分だけ引き伸ばされてぼける。切られていなければ掛けない
     （等倍の画にまで掛けると、ただ縁が硬くなるだけ）。 */
  var dpr = window.devicePixelRatio || 1;
  // 自動調整で下げたぶんも引き伸ばしなので、輪郭の持ち上げに足す
  u.uSharp.value = (settings.quality|0) >= 1 ? clamp((dpr - effPixelRatio()) * 0.9, 0, 0.85) : 0;
}

function buildViewModel(){
  viewScene = new THREE.Scene();
  viewCam = new THREE.PerspectiveCamera(52, 1, 0.01, 6);
  viewCam.position.set(0,0,0);

  /* 腕は本編とは別のシーンに置いて別に照らしている。本編の露出を
     下げたので、そのままだと手だけが白く浮いて貼り付けたように見える。
     環境光を半分以下にし、代わりにランプからの点光源を強く・近くする。
     指の間に落ちる影がはっきりして、平たい板の集まりに見えなくなる。 */
  viewScene.add(new THREE.AmbientLight(0x4c463e, 0.21));
  /* 主光は「前の床と壁で跳ね返って戻ってくる光」。
     ここを点光源にしていたのが間違いだった。跳ね返りの出どころは
     2〜4m 先の床と壁なので、腕の中では距離差がほとんど無い。
     点光源にすると距離の二乗で落ちるので、ランプを 34cm から 42cm へ
     下げただけで手の明るさが 13 分の 1 になり（実測 平均輝度 96→79）、
     ヘッドだけ真っ黒で白い縁が光る絵になった。
     平行光にすれば、指も筒も頭も同じ光量で受ける。 */
  var vl = new THREE.DirectionalLight(0xffd0a2, 2.7);
  vl.position.set(0.42, -0.62, -1.0);          // 前・下から（床の跳ね返り）
  viewScene.add(vl);
  /* レンズの周りから漏れる光。反射鏡の縁からは必ずいくらか横へ逃げるので、
     ヘッドと、それに近い指の第一関節だけが強く光る。ここは本当に
     距離が効くので点光源のままでよい。 */
  var vlB = new THREE.PointLight(0xffc890, 2.2, 0.62, 2.0);
  vlB.position.set(0.05, -0.135, -0.605);
  viewScene.add(vlB);
  /* 縁の光。廊下の非常灯と天井からの弱い光は、常に後ろ上から来る。
     指の上の稜だけを冷たく光らせて、暗い背景から輪郭を切り離す。
     ランプを消しても残る唯一の光でもある。 */
  /* 0.85 は強すぎた。節ごとに径を膨らませてある指の稜が、どれも同じ
     細さ・同じ明るさの線として乗り、しわが線画に見えていた。
     輪郭を暗い背景から切り離すという役目は残しつつ 0.52 まで落とし、
     減った分は環境光を 0.16 → 0.21 に上げて面で補う（稜だけを光らせる
     のではなく、面全体を持ち上げる）。 */
  var vlR = new THREE.DirectionalLight(0x8ea8c8, 0.52);
  vlR.position.set(-0.55, 0.85, 0.42);
  viewScene.add(vlR);
  var vl2 = new THREE.PointLight(0x62748c, 0.20, 3, 1.6);
  vl2.position.set(-0.4, -0.1, 0.2);
  viewScene.add(vl2);

  viewArm = new THREE.Group();
  viewScene.add(viewArm);
  viewRig = new THREE.Group();          // 画面比によって寄せ位置を変える
  viewArm.add(viewRig);

  // 無地の一色は樹脂に見えるので、肌も包帯も手続きテクスチャを貼る。
  // 色は彩度を落として病棟の暗い色調に馴染ませる（元の 0xcf8a58 は
  // 暖色が強すぎて、暗がりの中でオレンジの筒に見えていた）
  var skinTex = new THREE.CanvasTexture(texSkin(QC.tex >= 512 ? 512 : 256));
  skinTex.wrapS = skinTex.wrapT = THREE.RepeatWrapping;
  skinTex.repeat.set(1.6, 1.6);
  skinTex.colorSpace = THREE.SRGBColorSpace;
  var gauzeTex = new THREE.CanvasTexture(texGauze(QC.tex >= 512 ? 256 : 128));
  gauzeTex.wrapS = gauzeTex.wrapT = THREE.RepeatWrapping;
  gauzeTex.repeat.set(2.2, 1);
  gauzeTex.colorSpace = THREE.SRGBColorSpace;

  /* 腕は toneMapped:false で本編のトーンマップを外れていた。
     背景だけ ACES と最終合成を通り、手だけ素の値で出るので、
     どんなに照明を合わせても「貼り付けた絵」に見える。外す。
     あわせて法線マップを足す——肌の皺と包帯の織り目が、
     ランプの向きが変わるたびに起き上がるようになる。 */
  var skinN = QC.normalMaps ? new THREE.CanvasTexture(normalFrom(skinTex.image, 1.8)) : null;
  if(skinN){ skinN.wrapS = skinN.wrapT = THREE.RepeatWrapping; skinN.repeat.set(1.6,1.6); }
  var gauzeN = QC.normalMaps ? new THREE.CanvasTexture(normalFrom(gauzeTex.image, 2.4)) : null;
  if(gauzeN){ gauzeN.wrapS = gauzeN.wrapT = THREE.RepeatWrapping; gauzeN.repeat.set(2.2,1); }
  /* 肌の色。地の色（線形 0.66,0.51,0.42）に肌のテクスチャ（線形
     0.44,0.24,0.15）を掛けると最終の反射率が (0.29,0.12,0.06)——
     緑が赤の 4 割しかない、チョコレート色になっていた。実際の肌は
     暗がりでももっと彩度が低い（およそ 赤:緑:青 = 1:0.65:0.55）。
     色むらはテクスチャ側に任せ、材質の色は無彩色に近づける。 */
  /* 粗さが一様 0.86 だと、関節の隆起にできる稜が全部そろって同じ鋭さで
     光る。画面の手前 40cm でそれをやると、しわが白い線画のように見える。
     実際の肌は関節や指先が乾いて粗く、甲は皮脂で滑らか。色むらの絵から
     粗さを起こして 0.72〜0.94 に散らすと、稜の光り方が場所ごとに変わる。 */
  var skinR = new THREE.CanvasTexture(roughFrom(skinTex.image, 0.72, 0.94));
  skinR.wrapS = skinR.wrapT = THREE.RepeatWrapping;
  skinR.repeat.set(1.6, 1.6);
  var skin  = new THREE.MeshStandardMaterial({
    color:0xe4e0dc, map:skinTex, normalMap:skinN, roughnessMap:skinR, roughness:1.0
  });
  /* 包帯。地の色 0xd9d4c4 を線形のまま使っていたので反射率 0.85、
     そこへ織り目のテクスチャ（0.62）を掛けても 0.53 ある。新品の
     コピー用紙より白い布が薄暗い廊下にあることになり、手の甲を横切る
     一枚だけが必ず白飛びしていた。汚れたガーゼは 0.3 前後。 */
  var band  = new THREE.MeshStandardMaterial({
    color:SRGB(0xbdb8a8), map:gauzeTex, normalMap:gauzeN, roughness:0.86
  });
  /* ランプの筒。無地だと画面の中央でただの黒い円柱になる。旋盤の筋・
     陽極酸化のむら・擦れた地金を貼り、粗さも同じ絵から作る。
     金属の色は反射率そのもの。0x4a4f52 は線形で 0.075——黒鉛より
     暗い金属で、光源が一つしかない廊下では白い筋以外まったく返さない
     （黒い棒に白い線が乗っているだけに見えていた）。使い込んだ
     アルミの地金（0.32 前後）にする。中間調が出て、初めて筒に見える。 */
  var lampTex = new THREE.CanvasTexture(texLampMetal(QC.tex >= 512 ? 512 : 256));
  lampTex.wrapS = lampTex.wrapT = THREE.RepeatWrapping;
  lampTex.colorSpace = THREE.SRGBColorSpace;
  var lampR = new THREE.CanvasTexture(roughFrom(lampTex.image, 0.30, 0.62));
  lampR.wrapS = lampR.wrapT = THREE.RepeatWrapping;
  var lampN = QC.normalMaps ? new THREE.CanvasTexture(normalFrom(lampTex.image, 1.1)) : null;
  if(lampN) lampN.wrapS = lampN.wrapT = THREE.RepeatWrapping;
  var metal = regEnvMat(new THREE.MeshStandardMaterial({
    color:SRGB(0x9aa0a3), map:lampTex, roughnessMap:lampR, normalMap:lampN,
    roughness:1.0, metalness:0.90,
    /* 金属は拡散反射がゼロなので、映り込みが全ての中間調を作る。
       環境マップは廊下の平均の明るさで焼いてあるが、ランプは
       ビームのすぐ脇にあって周囲が実際より明るい。その差を掛ける。 */
    envMapIntensity:2.2
  }));
  /* 握り。ローレット（菱形の刻み）を貼る。刻みは太さと丸みを一目で
     読ませる形なので、ここが無地だと筒の径が分からなくなる。
     材質は筒と同じアルミ。菱形の山が一つずつ光を返すので、握りだけ
     細かくきらめいて、手が触れている場所がはっきりする。 */
  var knurlTex = new THREE.CanvasTexture(texKnurl(QC.tex >= 512 ? 512 : 256));
  knurlTex.wrapS = knurlTex.wrapT = THREE.RepeatWrapping;
  knurlTex.colorSpace = THREE.SRGBColorSpace;
  var knurlN = QC.normalMaps ? new THREE.CanvasTexture(normalFrom(knurlTex.image, 2.6)) : null;
  if(knurlN) knurlN.wrapS = knurlN.wrapT = THREE.RepeatWrapping;
  var knurlM = regEnvMat(new THREE.MeshStandardMaterial({
    color:SRGB(0x8e9498), map:knurlTex, normalMap:knurlN, roughness:0.52, metalness:0.88,
    envMapIntensity:2.2
  }));
  /* 尻栓とスイッチのゴム。金属ではないので metalness は 0。
     反射率 0.045 は黒ゴムの実測に近い（暗いのは正しい）。 */
  var grip  = new THREE.MeshStandardMaterial({
    color:SRGB(0x3c3f40), roughness:0.82, metalness:0.0
  });
  var lensM = new THREE.MeshStandardMaterial({
    color:0xfff0d0, emissive:0xffdca0, emissiveIntensity:2.2, roughness:0.3
  });

  // ---- 腕とランプ。ランプの軸を原点にして組み立てる ----
  // 縦持ちの水平画角は狭いので、部品はかなり小さく作らないと画面を覆ってしまう
  var ARM = new THREE.Group();
  ARM.name = 'ARMROOT';
  /* 置き場所。以前は画面のほぼ中央に、視線と平行に、34cm の至近で
     構えていた。ランプの軸と視線のなす角が 5 度しかないので、
     見えるのは尻栓の真円だけ——画面の目立つ位置に、いちばん情報の
     少ない面（無地の黒い円盤）が正対して置かれていた。

     直し方は二つある。横へずらすと視差で斜めから見えるが、縦持ちは
     水平の画角が狭い（半幅が距離の 0.32 倍しかない）ので、ずらせる量に
     上限がある。そこで少し遠ざけて小さくし、そのぶん横へ出し、
     さらに手首の角度として 6 度だけひねる。
     斜めから見える角度は 5 度 → 16 度。筒の側面が読めるようになる。

     ひねりは光軸と模型の向きを 6 度ずらすことになるが、実際の照射角は
     33 度あるので、狙った所が照らせなくなることはない。 */
  ARM.position.set(0.082, -0.150, -0.420);
  ARM.rotation.set(0.045, 0.115, 0.145);
  viewRig.add(ARM);

  /* 分割数。筒は画面の手前 40cm にあるので、輪郭の多角形がそのまま
     見える。16 分割だと 22.5 度ごとに角が立ち、尻栓が六角形に見えていた。
     最高品質だけ 26 に上げる（腕は一つに焼き固めるのでドローコールは
     増えない。増えるのは頂点だけ）。 */
  var LSEG = QC.detail ? 26 : 14;
  function tube(rTop, rBot, len, mat, seg){
    var m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, seg || 10), mat || skin);
    m.rotation.x = Math.PI/2;                 // 軸を Z 方向へ
    return m;
  }
  // ---- ランプ本体（軸 = ARM のローカル原点） ----
  var body = tube(0.020, 0.022, 0.170, metal, LSEG);
  body.position.set(0, 0, -0.060);
  ARM.add(body);
  var gripRing = tube(0.0245, 0.0245, 0.052, knurlM, LSEG);
  gripRing.position.set(0, 0, -0.020);
  ARM.add(gripRing);
  var headC = tube(0.033, 0.021, 0.056, metal, LSEG);
  headC.position.set(0, 0, -0.173);
  ARM.add(headC);
  var bezel = new THREE.Mesh(new THREE.TorusGeometry(0.0305, 0.0045, QC.detail ? 10 : 6, LSEG), metal);
  bezel.position.set(0, 0, -0.201);
  ARM.add(bezel);
  var lens = new THREE.Mesh(new THREE.CircleGeometry(0.0295, LSEG), lensM);
  lens.position.set(0, 0, -0.2035);
  ARM.add(lens);

  /* ---- 尾部 ----
     筒の手前側の蓋が、握った拳のちょうど中心に来る。そこが無地の
     金属円盤のままだったので、画面でいちばん目を引く場所に、いちばん
     情報の無い面が置かれていた。ゴムの尻栓・金属の縁・通電表示に分ける。
     どれも数百面だが、握りの中心なので効きが大きい。 */
  var tail = tube(0.0225, 0.0208, 0.017, grip, LSEG);
  tail.position.set(0, 0, 0.0325);
  ARM.add(tail);
  var tailRing = new THREE.Mesh(new THREE.TorusGeometry(0.0218, 0.0026, QC.detail ? 8 : 5, LSEG), metal);
  tailRing.position.set(0, 0, 0.0245);
  ARM.add(tailRing);
  /* 押しボタン。平らな円盤は面の向きが一定なので、どんな光を当てても
     一様な塗りにしかならない——画面のいちばん目立つ所が、ただの黒い円に
     なっていた。ゴムのボタンは実際わずかに膨らんでいる。半球を潰して
     置くと、縁へ向かって面が寝るぶん階調が出て「押せる物」に見える。 */
  var btn = new THREE.Mesh(
    new THREE.SphereGeometry(0.0172, LSEG, QC.detail ? 10 : 6, 0, TAU, 0, Math.PI/2), grip);
  btn.rotation.x = Math.PI/2;      // 半球の頂点をカメラ側（+Z）へ
  btn.scale.set(1, 0.34, 1);       // 潰す。軸は回す前の Y
  btn.position.set(0, 0, 0.0398);
  ARM.add(btn);
  // 通電表示。点いていることが手元でも分かる（消灯中は暗い赤に落とす）
  var ledM = new THREE.MeshBasicMaterial({ color:0xff3a24 });
  // 画面の最前面で直径 50px ほどになる。10 分割では十角形が読めるので上げる
  var led = new THREE.Mesh(new THREE.CircleGeometry(0.0040, QC.detail ? 22 : 10), ledM);
  led.position.set(0.0078, 0.0058, 0.0462);   // 膨らんだ面の上に乗せる
  ARM.add(led);
  // 側面のスイッチ。親指の掛かる位置に置く
  var sw = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.006, 0.022), grip);
  sw.position.set(0.0205, 0.006, -0.028);
  sw.rotation.z = -0.28;
  ARM.add(sw);

  /* ---- 手と前腕 ----
     円柱と球を並べる作り方だと、関節ごとに面が途切れてソーセージを繋いだ
     ように見える。人体は一続きの皮膚が骨と筋肉の起伏を包んだものなので、
     断面（楕円）を少しずつ変えながら掃引して、一枚の面として張る。

     寸法は成人男性の実測値に合わせてある（前腕長 26cm、手掌長 9.5cm、
     中指 8.2cm など）。ランプの太さもそれに準じているので、握りの
     見え方が破綻しない。 */

  // 楕円断面の掃引。stations は ARM ローカル座標で直接指定する。
  // up は断面の縦軸を決めるベクトル（進行方向と直交化して使う）
  function sweepGeo(st, radial, capA, capB){
    var n = st.length, R = radial;
    var pos = [], uvs = [], ind = [];
    var T = new THREE.Vector3(), U = new THREE.Vector3(), Rt = new THREE.Vector3();
    var P = new THREE.Vector3(), tmp = new THREE.Vector3();
    var run = [0], i, k;
    for(i=1;i<n;i++){
      run.push(run[i-1] + Math.sqrt(
        Math.pow(st[i].p[0]-st[i-1].p[0],2) +
        Math.pow(st[i].p[1]-st[i-1].p[1],2) +
        Math.pow(st[i].p[2]-st[i-1].p[2],2)));
    }
    var total = run[n-1] || 1;
    for(i=0;i<n;i++){
      var a = st[Math.max(0,i-1)].p, b = st[Math.min(n-1,i+1)].p;
      T.set(b[0]-a[0], b[1]-a[1], b[2]-a[2]);
      if(T.lengthSq() < 1e-12) T.set(0,0,1);
      T.normalize();
      U.set(st[i].up[0], st[i].up[1], st[i].up[2]);
      Rt.crossVectors(U, T);
      if(Rt.lengthSq() < 1e-12) Rt.set(1,0,0);   // up と進行方向が平行になった保険
      Rt.normalize();
      U.crossVectors(T, Rt).normalize();
      P.set(st[i].p[0], st[i].p[1], st[i].p[2]);
      for(k=0;k<R;k++){
        var th = k/R*TAU;
        tmp.copy(P).addScaledVector(Rt, Math.cos(th)*st[i].rx)
                   .addScaledVector(U,  Math.sin(th)*st[i].ry);
        pos.push(tmp.x, tmp.y, tmp.z);
        uvs.push(k/R, run[i]/total);
      }
    }
    // 断面は (Rt, U, T) の右手系に沿って反時計回りに並ぶ。表を外へ向けるには
    // 進行方向へ渡る辺を後ろに置く（逆にすると全面が裏返って消える）
    for(i=0;i<n-1;i++) for(k=0;k<R;k++){
      var k2 = (k+1)%R, r0 = i*R, r1 = (i+1)*R;
      ind.push(r0+k, r0+k2, r1+k, r0+k2, r1+k2, r1+k);
    }
    /* 端の蓋。頂点ひとつへ扇を張ると円錐になり、指先が角張って
       「平らに切り落とした多角形」に見えていた（画面の手前 40cm にある
       指先で、面が 5〜6 枚読める）。半球の断面に沿った輪を 1〜2 段
       挟んでから頂点へ閉じる。dome が 0 のとき（平らな蓋）は従来どおり。 */
    function cap(si, dirSign, dome){
      var s0 = st[si];
      var a2 = st[Math.max(0,si-1)].p, b2 = st[Math.min(n-1,si+1)].p;
      T.set(b2[0]-a2[0], b2[1]-a2[1], b2[2]-a2[2]).normalize();
      // 断面の基底を掃引時と同じ手順で作り直す
      U.set(s0.up[0], s0.up[1], s0.up[2]);
      Rt.crossVectors(U, T);
      if(Rt.lengthSq() < 1e-12) Rt.set(1,0,0);
      Rt.normalize();
      U.crossVectors(T, Rt).normalize();
      P.set(s0.p[0], s0.p[1], s0.p[2]);
      var rings = (dome > 0) ? (QC.detail ? 2 : 1) : 0;
      var prev = si*R, j, kk;
      for(j=1;j<=rings;j++){
        var t2 = j/(rings+1) * Math.PI/2;
        var sc = Math.cos(t2), off = Math.sin(t2)*dome*dirSign;
        var c0 = pos.length/3;
        for(kk=0;kk<R;kk++){
          var th2 = kk/R*TAU;
          tmp.copy(P).addScaledVector(T, off)
                     .addScaledVector(Rt, Math.cos(th2)*s0.rx*sc)
                     .addScaledVector(U,  Math.sin(th2)*s0.ry*sc);
          pos.push(tmp.x, tmp.y, tmp.z);
          uvs.push(kk/R, si===0 ? 0 : 1);
        }
        // 巻き方向は胴と同じ規則で。手前側の蓋は輪の並びが逆向きになる
        for(kk=0;kk<R;kk++){
          var kb = (kk+1)%R;
          if(dirSign > 0) ind.push(prev+kk, prev+kb, c0+kk, prev+kb, c0+kb, c0+kk);
          else            ind.push(c0+kk, c0+kb, prev+kk, c0+kb, prev+kb, prev+kk);
        }
        prev = c0;
      }
      var c = pos.length/3;
      pos.push(P.x + T.x*dome*dirSign, P.y + T.y*dome*dirSign, P.z + T.z*dome*dirSign);
      uvs.push(0.5, si===0 ? 0 : 1);
      for(k=0;k<R;k++){
        var k2b = (k+1)%R;
        if(dirSign > 0) ind.push(prev+k, prev+k2b, c);
        else            ind.push(prev+k2b, prev+k, c);
      }
    }
    if(capA) cap(0, -1, capA === 2 ? st[0].ry*0.8 : 0);
    if(capB) cap(n-1, 1, capB === 2 ? st[n-1].ry*0.9 : 0);

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geo.setIndex(ind);
    geo.computeVertexNormals();
    fixNormals(geo);            // 蓋の頂点で法線がゼロ長になり NaN になる
    return geo;
  }

  /* 握った手がランプの胴に埋まると、指が金属に溶けたように見える。
     手の頂点が胴の半径より内側へ入ったら、外へ押し出して表面に沿わせる。
     実際に物を握った指の腹も接触面で平らに潰れるので、形としても正しい。
     半径はランプ各部の実寸から引いている（胴 0.022 / 握り輪 0.0245 / 頭 0.021→0.033）。 */
  function barrelRadiusAt(z){
    var r = 0;
    if(z > -0.145 && z < 0.026) r = 0.022;
    if(z > -0.047 && z < 0.007) r = Math.max(r, 0.0245);
    if(z > -0.202 && z <= -0.145) r = Math.max(r, 0.021 + ((-0.145 - z)/0.057)*0.012);
    return r;
  }
  function hugBarrel(geo, clearance){
    var pa = geo.attributes.position, changed = 0;
    for(var i=0;i<pa.count;i++){
      var x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i);
      var need = barrelRadiusAt(z);
      if(need <= 0) continue;
      need += (clearance === undefined ? 0.0008 : clearance);
      var rad = Math.sqrt(x*x + y*y);
      if(rad >= need || rad < 1e-6) continue;
      var k = need/rad;
      pa.setXY(i, x*k, y*k);
      changed++;
    }
    if(changed){ pa.needsUpdate = true; geo.computeVertexNormals(); fixNormals(geo); }
    return geo;
  }

  /* 指と手のひらの断面の分割数。指は 9 分割だと 40 度ごとに角が立ち、
     握った指の輪郭が階段状に見えていた（画面の手前 40cm にあるので
     そのまま読める）。手のひらは 12 分割で 30 度ごと。最高品質だけ上げる。 */
  var DSEG = QC.detail ? 12 : 8, PSEG = QC.detail ? 16 : 10;
  var skinParts = [], bandParts = [], nailParts = [], digitLens = [], digitSt = [];
  function addSkin(geo){ skinParts.push(new THREE.Mesh(geo, skin)); }
  function addBand(geo){ bandParts.push(new THREE.Mesh(geo, band)); }

  /* 指：基節・中節・末節の3節。長さの比はおよそ 45% : 30% : 25% で、
     これは実際の指骨の比率に近い。関節では骨頭が張り出すので径を膨らませ、
     節の中ほどはやや細くする。ランプの胴を握るため、節ごとに進行方向を
     回して巻き付ける（MCP 50°・PIP 80°・DIP 45°、合計でほぼ半周）。 */
  function digit(o){
    /* 指は自由な円弧では曲げない。曲げ角を積むだけだと、できあがる円弧の
       中心が胴の軸とずれ、指が宙に浮いて「握っている」ように見えない
       （実際そうなっていた。接触は一点だけで、指の中央は胴から 2〜3cm 離れていた）。

       握りは「胴の周りに巻き付く」動作なので、位置そのものを
       軸まわりの角度と軸からの距離で作る。基節のあいだに胴の表面まで
       降り、以降は接触半径（胴の半径＋指の半径）をなぞる。
       こうすると構造として必ず胴に触れる。 */
    var st = [];
    var ang = o.a0, rad = o.r0, z = o.z0;
    var segs = [
      { len:o.len*0.45, n:4, reach:1 },     // 基節：ここで胴へ降りる
      { len:o.len*0.30, n:3, reach:0 },     // 中節：表面をなぞる
      { len:o.len*0.25, n:3, reach:0 }      // 末節：先端はわずかに巻き込む
    ];
    var done = 0, totalLen = o.len;
    st.push({ p:[Math.cos(ang)*rad, Math.sin(ang)*rad, z],
              rx:o.r*1.10, ry:o.r*1.14, up:[0,0,1] });   // 付け根＝中手骨頭の膨らみ
    for(var sgi=0; sgi<segs.length; sgi++){
      var sg = segs[sgi];
      for(var i=1;i<=sg.n;i++){
        var step = sg.len/sg.n;
        done += step;
        var u = done/totalLen;
        var joint01 = (i === sg.n) ? 1 : 0;
        var taper = 1 - u*0.30;                       // 先へ行くほど細い
        var swell = joint01 ? 1.13 : (i === 1 ? 1.02 : 0.96);
        var rr = o.r*taper*swell;
        // 接触半径：胴の表面に指の腹が乗る位置
        var contact = barrelRadiusAt(z) + rr + 0.0006;
        if(sg.reach){
          rad += (contact - rad) * (i/sg.n) * o.press;  // 基節で寄せる
        }else{
          rad = contact - o.dig*rr;                    // 以降は沿わせる（少し食い込ませて密着させる）
        }
        ang += (step/Math.max(rad, 0.005)) * o.wrap;
        z += o.splay*step;
        st.push({ p:[Math.cos(ang)*rad, Math.sin(ang)*rad, z],
                  rx:rr, ry:rr*1.06, up:[0,0,1] });
      }
    }
    // 指先は丸める
    var last = st[st.length-1];
    last.rx *= 0.82; last.ry *= 0.82;
    addSkin(hugBarrel(sweepGeo(st, DSEG, 1, 2)));
    return st;
  }

  /* 爪：末節の背側（＝胴の軸から見て外向き）に薄く貼る。
     掃引の断面は up=[0,0,1] のとき rx が半径方向＝厚み、ry が指の幅方向になる。
     ここを取り違えると、爪が指から半径方向へ飛び出した板になって
     指先に白い塊が乗っているように見える（実際そうなっていた）。 */
  function nail(st, r){
    var i0 = st.length-4, ns = [];
    for(var i=0;i<4;i++){
      var a = st[Math.min(st.length-1, i0+i)];
      var rr = Math.sqrt(a.p[0]*a.p[0] + a.p[1]*a.p[1]) || 1;
      var ox = a.p[0]/rr, oy = a.p[1]/rr;          // 背側＝軸から外向き
      var lift = a.rx*0.60;
      ns.push({ p:[a.p[0]+ox*lift, a.p[1]+oy*lift, a.p[2]],
                rx:r*0.13, ry:r*(0.70 - i*0.11), up:[0,0,1] });
    }
    nailParts.push(new THREE.Mesh(sweepGeo(ns, QC.detail ? 10 : 7, 1, 2), nailMat));
  }

  /* 爪。toneMapped:false のままだと ACES を素通りするので、指が暗い所でも
     爪だけが白く飛ぶ。実際、指先に白い三角が乗っているように見えていた。
     トーンマップに戻し、色も肌より少しだけ明るい程度に落とす。
     爪は角質なので粗さは肌より低い（濡れたように光る）。 */
  var nailMat = new THREE.MeshStandardMaterial({
    color:SRGB(0xa89286), roughness:0.42, metalness:0.0
  });

  /* 手掌：手根から中手骨頭の並びまで。板ではなく、胴を包む向きに湾曲した
     塊として作る。母指球（親指の付け根の肉）と小指球で厚みが違うので、
     断面の縦横を位置ごとに変える。 */
  var palmSt = [];
  (function(){
    var steps = 7;
    for(var i=0;i<=steps;i++){
      var u = i/steps;
      var ang = (-46 + u*80) * DEG;              // 手首側の下から、指の付け根の上まで回り込む
      var rad = 0.0335 + Math.sin(u*Math.PI)*0.0035;
      var zc  = -0.030 - u*0.008;                // 指側へわずかに寄る
      // 幅（Z方向）は手首で狭く、中手骨頭の並びで最大
      var half = 0.021 + u*0.021;         // 中手骨頭の並び幅に合わせる
      var thick = 0.0125 + Math.sin(u*Math.PI)*0.0045;
      palmSt.push({
        p:[Math.cos(ang)*rad, Math.sin(ang)*rad, zc],
        rx:thick, ry:half, up:[0,0,1]
      });
    }
  })();
  addSkin(hugBarrel(sweepGeo(palmSt, PSEG, 2, 1)));

  // 母指球：親指の付け根の肉。手のひらで一番厚い部分で、ここが無いと板に見える
  var thenar = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 9), skin);
  thenar.position.set(0.030, -0.019, -0.006);
  thenar.scale.set(0.72, 0.95, 1.25);
  skinParts.push(thenar);
  // 小指球：反対側の膨らみ。母指球より控えめ
  var hypo = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), skin);
  hypo.position.set(0.031, 0.004, -0.076);
  hypo.scale.set(0.66, 1.10, 0.95);
  skinParts.push(hypo);

  /* 4本の指。長さは中指を最長に、示指・環指・小指の順で短くなる。
     付け根の並び（中手骨頭）は直線ではなく弧を描き、小指側ほど手前に退がる。 */
  /* 指の間隔は指の太さより広く取る。詰めると隣どうしの面がくっついて
     一本の輪に見え、指の本数が分からなくなる（実際そう見えていた）。
     中手骨頭の並びは実測でおよそ 75mm 幅なので、22〜23mm 間隔が実寸でもある。 */
  var FING = [
    // len   r      z       付け根の弧による前後差   広がり
    { len:0.075, r:0.0098, z:-0.012, back:0.0035, splay:-0.030 },  // 示指
    { len:0.082, r:0.0100, z:-0.035, back:0.0000, splay:-0.008 },  // 中指
    { len:0.077, r:0.0094, z:-0.058, back:0.0030, splay: 0.012 },  // 環指
    { len:0.062, r:0.0082, z:-0.080, back:0.0105, splay: 0.030 }   // 小指
  ];
  for(var fi=0; fi<4; fi++){
    var F = FING[fi];
    var kang = (26 - F.back*260) * DEG;          // 弧のぶん付け根の角度をずらす
    var stF = digit({
      a0: kang, r0: 0.0355, z0: F.z,
      len: F.len, r: F.r, splay: F.splay,
      press: 1.0, dig: 0.10, wrap: 1.0
    });
    nail(stF, F.r);
    digitLens.push(F.len);
    digitSt.push(stF);
  }

  /* 親指：他の4指と違って中手骨から動き、2節しかない。
     手のひら側から胴の下へ回り込ませる（対立位）。 */
  // 親指は他の4指と逆回りに、胴の下から回り込ませる（対立位）
  var thumbSt = digit({
    a0: -46*DEG, r0: 0.0360, z0: 0.014,
    len: 0.070, r: 0.0125, splay: -0.42,
    press: 0.9, dig: 0.06, wrap: -1.0
  });
  nail(thumbSt, 0.0125);

  /* ---- 手根と前腕 ----
     前腕は単なる円錐ではない。肘寄り 1/4 に屈筋群の膨らみがあり、
     手首へ向かって細くなりながら断面が扁平になる（手首は横に広く薄い）。
     この扁平さが無いと丸太に見える。 */
  /* 前腕は手掌の付け根（手根隆起）からそのまま続く一本の面として作る。
     以前は手掌と前腕を別々に置いて球で塞いでいたため、手首で径と向きが
     不連続になり、付け根が別部品を差し込んだように見えていた。

     向きも直す。sweepGeo は up がほぼ ry の向きになる（up⊥T のとき
     U = T×(up×T) = up）。前腕を掌背方向に扁平にしたいので、up は
     「手のひらの面に沿う向き」でなければならない。以前は一律 +Y に
     していたので、手のひら（胴に巻き付いて傾いている）に対して扁平の
     向きが 90度ねじれていた。手首側は手のひらに合わせ、肘側へ向かって
     ゆるく回内していく形にする。

     さらに、前腕が胴とほぼ平行だったのも無理があった。実際に前へ向けた
     ライトを握ると、前腕は柄に対して 30〜45度の角度で入ってくる。 */
  var foreSt = [];
  (function(){
    var heel = palmSt[0].p;                     // 手掌の付け根＝ここから続ける
    var A = [heel[0] + 0.004, heel[1] - 0.004, heel[2] + 0.012];
    var B = [0.150, -0.108, 0.250];             // 肘。柄に対して約 32 度で入る
    // 手首での掌背方向（＝胴の軸から手掌の付け根へ向かう向き）
    var hr = Math.sqrt(heel[0]*heel[0] + heel[1]*heel[1]) || 1;
    var dorsal = [heel[0]/hr, heel[1]/hr, 0];
    var dir = [B[0]-A[0], B[1]-A[1], B[2]-A[2]];
    var dl2 = Math.sqrt(dir[0]*dir[0] + dir[1]*dir[1] + dir[2]*dir[2]);
    dir = [dir[0]/dl2, dir[1]/dl2, dir[2]/dl2];
    // up = T × dorsal（＝掌背方向を rx に、幅を ry に割り当てる）
    var upW = [
      dir[1]*dorsal[2] - dir[2]*dorsal[1],
      dir[2]*dorsal[0] - dir[0]*dorsal[2],
      dir[0]*dorsal[1] - dir[1]*dorsal[0]
    ];
    var ul = Math.sqrt(upW[0]*upW[0] + upW[1]*upW[1] + upW[2]*upW[2]) || 1;
    upW = [upW[0]/ul, upW[1]/ul, upW[2]/ul];
    var upE = [0.18, 0.97, 0];                  // 肘側：回内して縦向きに戻る

    var prof = [
      // t,   掌背の厚み, 橈尺の幅
      [0.00, 0.0135, 0.0225],   // 手根隆起：手掌の断面をそのまま受ける
      [0.05, 0.0150, 0.0250],
      [0.12, 0.0176, 0.0268],   // 手首：掌背に薄く、橈尺に広い
      [0.22, 0.0221, 0.0292],   // 腱が浮くあたり
      [0.38, 0.0292, 0.0334],
      [0.55, 0.0355, 0.0384],
      [0.72, 0.0402, 0.0424],   // 屈筋群の最大部
      [0.87, 0.0404, 0.0416],
      [1.00, 0.0378, 0.0390]    // 肘側はほぼ丸い
    ];
    for(var i=0;i<prof.length;i++){
      var t = prof[i][0];
      var bow = Math.sin(t*Math.PI)*0.008;      // 尺側へ少したわませる
      var e = t*t*(3-2*t);                      // up の切り替わりはなめらかに
      foreSt.push({
        p:[A[0] + (B[0]-A[0])*t, A[1] + (B[1]-A[1])*t - bow, A[2] + (B[2]-A[2])*t],
        rx:prof[i][1], ry:prof[i][2],
        up:[upW[0] + (upE[0]-upW[0])*e,
            upW[1] + (upE[1]-upW[1])*e,
            upW[2] + (upE[2]-upW[2])*e]
      });
    }
  })();
  /* 前腕は腕でいちばん面積の大きい面なのに、分割が 14 固定だった
     （25.7 度ごと）。指の 12 分割は太さ 1.5cm、前腕は 8cm あるので、
     同じ分割数でも輪郭の角は 5 倍大きく出る。最高品質だけ上げる。 */
  addSkin(sweepGeo(foreSt, QC.detail ? 22 : 14, 1, 0));

  /* ---- 包帯 ---- */
  // 前腕に巻いた包帯。手首側から前腕半ばまで、少しずつ角度を変えて重ねる
  for(var wi=0; wi<7; wi++){
    var t01 = wi/6;
    var tt = 0.02 + t01*0.42;                   // 前腕パラメータ上の位置
    // その位置の実寸を掃引と同じ式から拾う（埋まり・浮きを防ぐ）
    var ix = Math.min(foreSt.length-2, Math.floor(tt*(foreSt.length-1)));
    var fr = (tt*(foreSt.length-1)) - ix;
    var s0 = foreSt[ix], s1 = foreSt[ix+1];
    var px = s0.p[0] + (s1.p[0]-s0.p[0])*fr;
    var py = s0.p[1] + (s1.p[1]-s0.p[1])*fr;
    var pz = s0.p[2] + (s1.p[2]-s0.p[2])*fr;
    var rx = (s0.rx + (s1.rx-s0.rx)*fr) + 0.0022;
    var ry = (s0.ry + (s1.ry-s0.ry)*fr) + 0.0022;
    var dx = s1.p[0]-s0.p[0], dy = s1.p[1]-s0.p[1], dz = s1.p[2]-s0.p[2];
    var dl = Math.sqrt(dx*dx+dy*dy+dz*dz) || 1;
    var w = 0.011;
    var tilt = (wi % 2 ? 0.10 : -0.10);
    var u0 = s0.up, u1 = s1.up;
    var ub = [u0[0]+(u1[0]-u0[0])*fr, u0[1]+(u1[1]-u0[1])*fr, u0[2]+(u1[2]-u0[2])*fr];
    addBand(sweepGeo([
      { p:[px-dx/dl*w, py-dy/dl*w - tilt*0.004, pz-dz/dl*w], rx:rx*0.99, ry:ry*0.99, up:ub },
      { p:[px, py, pz], rx:rx, ry:ry, up:[ub[0]+tilt, ub[1], ub[2]] },
      { p:[px+dx/dl*w, py+dy/dl*w + tilt*0.004, pz+dz/dl*w], rx:rx*0.99, ry:ry*0.99, up:ub }
    ], QC.detail ? 20 : 12, 0, 0));
  }
  // 巻き終わりのほつれ
  var loose = new THREE.Mesh(new THREE.BoxGeometry(0.010, 0.030, 0.016), band);
  loose.position.set(0.062, -0.052, 0.088);
  loose.rotation.set(0.3, 0.2, 0.5);
  bandParts.push(loose);
  // 手の甲を横切る一枚
  addBand(hugBarrel(sweepGeo([
    { p:[0.030, 0.012, -0.020], rx:0.0135, ry:0.030, up:[0,0,1] },
    { p:[0.036, 0.000, -0.020], rx:0.0140, ry:0.032, up:[0,0,1] },
    { p:[0.032,-0.014, -0.020], rx:0.0130, ry:0.028, up:[0,0,1] }
  ], 10, 0, 0), 0.0022));

  // 患者用リストバンド
  // 包帯と同じ理由で、トーンマップを外していたのを戻して反射率も落とす
  var idBandMat = new THREE.MeshStandardMaterial({
    color:SRGB(0xc6c2b4), map:gauzeTex, roughness:0.75
  });
  var wbA = foreSt[2], wbB = foreSt[3];        // 手首の少し肘寄りに巻く
  var wbG = sweepGeo([
    { p:[wbA.p[0]+(wbB.p[0]-wbA.p[0])*0.10, wbA.p[1]+(wbB.p[1]-wbA.p[1])*0.10, wbA.p[2]+(wbB.p[2]-wbA.p[2])*0.10],
      rx:wbA.rx+0.0016, ry:wbA.ry+0.0016, up:wbA.up },
    { p:[wbA.p[0]+(wbB.p[0]-wbA.p[0])*0.42, wbA.p[1]+(wbB.p[1]-wbA.p[1])*0.42, wbA.p[2]+(wbB.p[2]-wbA.p[2])*0.42],
      rx:wbA.rx+0.0018, ry:wbA.ry+0.0018, up:wbA.up }
  ], 12, 0, 0);
  var wband = new THREE.Mesh(wbG, idBandMat);
  ARM.add(wband);

  /* ---- 部品をマテリアルごとに1つへ焼き固める ----
     腕は毎フレーム必ず画面にあり、部品のまま出すとドローコールを
     40 以上使う。腕の中で相対運動する部品は無いので、まとめてよい。 */
  var skinGeo = null;
  (function(){
    var groups = [ [skinParts, skin], [bandParts, band], [nailParts, nailMat] ];
    var eye = new THREE.Matrix4();
    for(var gi=0; gi<groups.length; gi++){
      var list = groups[gi][0];
      if(!list.length) continue;
      for(var mi=0; mi<list.length; mi++) list[mi].updateMatrixWorld(true);
      var merged = mergeMeshes(list, eye);
      // 母指球などの塊は変換を持つので、結合後の座標で改めて胴に沿わせる
      if(gi < 2) hugBarrel(merged);
      ARM.add(new THREE.Mesh(merged, groups[gi][1]));
      if(gi === 0) skinGeo = merged;
    }
  })();

  viewArm.traverse(function(o){ if(o.isMesh){ o.castShadow = false; o.receiveShadow = false; } });
  viewParts = { lens:lensM, led:ledM, skin:skin, metal:metal, skinTex:skinTex, gauzeTex:gauzeTex,
                base:{ x:0, y:0, z:0 }, root:ARM,
                /* ランプから出た光（直接・跳ね返り）は、消灯したら消える。
                   固定にしていたので、灯りを消しても手だけが暖かく
                   照らされたままだった。強さを控えて毎フレーム戻す。 */
                keyLight:vl, keyI:vl.intensity,
                bounceLight:vlB, bounceI:vlB.intensity,
                skinGeo:skinGeo, digitLens:digitLens, digitSt:digitSt, barrelAt:barrelRadiusAt };
}

/* 断面を掃引して一枚の皮を張る。
   円柱と球を重ねて体を作ると、どれだけ数を増やしても部品の縁が面の途中に
   出てくる。掴まれる距離まで寄られたときに「何かを積んだ物」に見える
   いちばんの理由がこれだった。曲げない部位（胴）と、1 本の骨として
   曲がる部位（上腕・前腕・腿・脛）は、断面を少しずつ変えながら掃いて
   一続きの面にできる。

   半径を返す関数 rad(theta, v, i) を受け取るのが要点。肋の谷も背骨の溝も
   鎖骨の張りも、別の部品を貼り足すのではなく面そのものの起伏として作れる。
   陰りも同じ場所から出せる——周りより凹んでいる頂点を暗くすればいい
   （光線を飛ばす必要がない）。

     rows … [{y, cx, cz, rx, rz}] を下から上へ
     R    … 断面の分割数
     rad  … (theta, v, i) → 半径の倍率。省略時は 1
     opts … capA/capB で下端・上端に蓋（ドーム）を付ける */
/* 色を sRGB として書きたいとき用。
   three r128 は色管理をしないので material.color は線形の値として
   そのまま使われる。0x2a322e を「暗い緑」のつもりで置いても
   線形 16% ＝ かなり明るい灰になる。暗いつもりの物が軒並み暗くならず、
   髪も配管も羽根板も白っぽく出ていた原因。sRGB で書いて線形へ直す。 */
function SRGB(hex){ return new THREE.Color(hex).convertSRGBToLinear(); }

/* three r128 の computeVertexNormals は、最後に normalizeNormals で
   n = 1/sqrt(x²+y²+z²) を掛ける。ゼロ長を守っていないので、隣接面の法線が
   ちょうど打ち消し合う頂点（蓋の頂点まわりや、退化した三角形しか持たない
   頂点）では 1/0=Infinity × 0 = NaN になる。
   NaN の法線は照明の計算をすべて NaN にする。デスクトップのドライバは
   そのまま何か描いてしまうが、iOS の WebGL は断片ごと捨てるため、その
   部品だけが消える。実測：追跡者の胴に 40 頂点、四肢の骨に各 6 頂点。
   実機（iPhone/Safari）で「頭と手と衣服と足だけ見える」と報告された症状の
   正体がこれ。壊れた法線を、原点から外向きの方向で置き換える。 */
function fixNormals(g){
  var na = g.attributes.normal, pa = g.attributes.position;
  if(!na || !pa) return 0;
  var a = na.array, p = pa.array, n = na.count, bad = 0;
  for(var i=0;i<n;i++){
    var x = a[i*3], y = a[i*3+1], z = a[i*3+2];
    if(isFinite(x) && isFinite(y) && isFinite(z) && (x*x+y*y+z*z) > 1e-12) continue;
    bad++;
    var px = p[i*3], py = p[i*3+1], pz = p[i*3+2];
    var L = Math.sqrt(px*px + py*py + pz*pz);
    if(L > 1e-9){ a[i*3] = px/L; a[i*3+1] = py/L; a[i*3+2] = pz/L; }
    else { a[i*3] = 0; a[i*3+1] = 1; a[i*3+2] = 0; }
  }
  if(bad) na.needsUpdate = true;
  return bad;
}

/* シーン全体の法線を検める。fixNormals をぶら下がっている形すべてに掛ける。 */
function sanitizeNormals(root){
  var bad = 0;
  if(!root) return 0;
  root.traverse(function(o){ if(o.isMesh && o.geometry) bad += fixNormals(o.geometry); });
  return bad;
}

function loftGeo(rows, R, rad, opts){
  opts = opts || {};
  var n = rows.length, W = R + 1;          // 継ぎ目に列を 1 本増やして UV を通す
  var pos = new Float32Array(n*W*3), uvs = new Float32Array(n*W*2);
  var mm  = new Float32Array(n*W);
  var i, k, idx2;
  /* UV を実寸に比例させる。既定は部位ごとに 0..1 で、これだと
     胴（周長 1.2m）と腿（周長 0.27m）でテクセルの密度が 4 倍違う。
     同じ皮膚を貼っているのに部位ごとに模様の大きさが変わり、
     寄られたときに「別の材質を継いだ物」に見える。
     opts.uvPerM を渡すと 1m あたりその枚数で貼る。
     周長は行ごとに変わるが、行ごとに変えると texture が斜めに歪むので
     部品全体の平均で一定にする。テクスチャ側は鏡像で繰り返す
     （継ぎ目のある絵でも折り返せば必ず繋がる）。 */
  var uvU = 1, uvV = null;
  if(opts.uvPerM){
    var rsum = 0;
    for(i=0;i<n;i++) rsum += (rows[i].rx + rows[i].rz) * 0.5;
    uvU = TAU * (rsum/n) * opts.uvPerM;
    uvV = [0];
    for(i=1;i<n;i++) uvV.push(uvV[i-1] + Math.abs(rows[i].y - rows[i-1].y) * opts.uvPerM);
  }
  for(i=0;i<n;i++){
    var rw = rows[i], v = n>1 ? i/(n-1) : 0;
    for(k=0;k<W;k++){
      var th = (k % R) / R * TAU;
      var m = rad ? rad(th, v, i) : 1;
      idx2 = i*W + k;
      mm[idx2] = m;
      pos[idx2*3]   = (rw.cx||0) + Math.cos(th)*rw.rx*m;
      pos[idx2*3+1] = rw.y;
      pos[idx2*3+2] = (rw.cz||0) + Math.sin(th)*rw.rz*m;
      uvs[idx2*2]   = (k/R) * uvU;
      uvs[idx2*2+1] = uvV ? uvV[i] : v;
    }
  }
  var ind = [];
  for(i=0;i<n-1;i++) for(k=0;k<R;k++){
    var a = i*W+k, b = a+1, c = (i+1)*W+k, d = c+1;
    ind.push(a, b, c, b, d, c);            // 外を向く巻き方向
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(ind);
  g.computeVertexNormals();
  /* 継ぎ目の 2 列は同じ位置にあるのに別頂点なので、法線が食い違って
     縦に 1 本線が入る。平均して両方に入れ直す。 */
  var na = g.attributes.normal.array;
  for(i=0;i<n;i++){
    var p0 = (i*W)*3, p1 = (i*W + R)*3;
    var nx = (na[p0]+na[p1])*0.5, ny = (na[p0+1]+na[p1+1])*0.5, nz = (na[p0+2]+na[p1+2])*0.5;
    var L = Math.sqrt(nx*nx+ny*ny+nz*nz) || 1;
    na[p0]=na[p1]=nx/L; na[p0+1]=na[p1+1]=ny/L; na[p0+2]=na[p1+2]=nz/L;
  }
  /* 陰り。周りより半径が小さい＝谷になっている頂点を暗くする。
     肋の谷・背骨の溝・関節のくびれが、光の向きに関係なく沈む。 */
  var col = new Float32Array(n*W*3);
  for(i=0;i<n;i++) for(k=0;k<W;k++){
    var s = 0, cnt = 0;
    /* 近傍は 3x3。5x5 だと谷が均されて陰りがほとんど出なかった
       （胴の AO が 0.83〜1.00 にしかならず、肋が読めなかった）。 */
    for(var di=-1; di<=1; di++) for(var dk=-1; dk<=1; dk++){
      var ii = i+di; if(ii<0||ii>=n) continue;
      var kk = ((k+dk)%R + R)%R;
      s += mm[ii*W+kk]; cnt++;
    }
    var loc = cnt ? s/cnt : 1, me = mm[i*W+k];
    /* 係数 2.6 では、旧来の球を並べた胴（平均 0.884）に比べて陰りが
       浅すぎた（0.979）。谷をもっと沈める。 */
    var ao = clamp(1 - 9.0*Math.max(0, loc-me)/Math.max(loc, 1e-6), 0.30, 1);
    var o = (i*W+k)*3;
    col[o]=col[o+1]=col[o+2]=ao;
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  /* 端の蓋。中心を少し外へ出してドームにする。
     capA / capB は「行の y からどれだけ外へ出すか」をメートルで書く。
     割合ではない。行は y の小さいほうから並べる前提で、capA は
     最初の行の下へ、capB は最後の行の上へ伸びる。 */
  if(opts.capA || opts.capB){
    var base = g.attributes.position.count;
    var extraP = [], extraU = [], extraC = [];
    function addCap(rowIdx, dir, dome){
      var rw2 = rows[rowIdx];
      extraP.push(rw2.cx||0, rw2.y + dir*dome, rw2.cz||0);
      /* 蓋の頂点の v も、実寸に比例させた範囲に合わせる。
         ここだけ 0..1 のままにしていたので、部品ごとの密度を測ると
         蓋の 1 本が範囲を 1.0 まで押し広げて、揃えたはずの密度が
         3.5 倍ばらついて見えた（自己診断で気づいた）。 */
      extraU.push(0.5 * uvU, rowIdx ? (uvV ? uvV[n-1] : 1) : 0);
      extraC.push(1,1,1);
      var c2 = base + (extraP.length/3 - 1);
      for(var kk2=0; kk2<R; kk2++){
        var a2 = rowIdx*W + kk2, b2 = a2 + 1;
        if(dir > 0) ind.push(a2, b2, c2); else ind.push(b2, a2, c2);
      }
    }
    if(opts.capA) addCap(0, -1, opts.capA);
    if(opts.capB) addCap(n-1, 1, opts.capB);
    var P2 = g.attributes.position.array, U2 = g.attributes.uv.array, C2 = g.attributes.color.array;
    var np = new Float32Array(P2.length + extraP.length);
    np.set(P2); np.set(extraP, P2.length);
    var nu = new Float32Array(U2.length + extraU.length);
    nu.set(U2); nu.set(extraU, U2.length);
    var nc = new Float32Array(C2.length + extraC.length);
    nc.set(C2); nc.set(extraC, C2.length);
    g.setAttribute('position', new THREE.Float32BufferAttribute(np, 3));
    g.setAttribute('uv',       new THREE.Float32BufferAttribute(nu, 2));
    g.setAttribute('color',    new THREE.Float32BufferAttribute(nc, 3));
    g.setIndex(ind);
    g.computeVertexNormals();
  }
  fixNormals(g);
  g.computeBoundingSphere();
  return g;
}

/* 小物用の簡易結合。
   拾得物は「板 1 枚」「円柱 1 本」で置かれていた。集めることが目的の
   物なのに、いちばん見る時間が長いのに、いちばん形が無かった。
   部品に分けたいがマテリアルを分けると 1 個につきドローコールが
   3〜4 増える。色は頂点色に持たせて、1 個 1 メッシュのまま作る。

     type 省略  … 箱（w,h,d）
     type:'cyl' … 円柱（r=半径, h=長さ, ax:'y'|'x'|'z' で軸）
     c          … 0xRRGGBB。頂点色に焼き込む */
/* 出来合いのジオメトリをそのまま 1 本に繋ぐ。
   mergeMeshes は position・normal・uv しか運ばないので、頂点色を持つ
   ものを通すと色が消えて真っ黒になる（追跡者の足で一度やった）。
   髪の束のように「掃引で作った・頂点色を持つ・相対運動しない」部品を
   まとめるためのもの。全て同じ座標系に置いてから渡す。 */
function mergeGeos(list){
  var pos = [], nor = [], uvs = [], col = [], ind = [], base = 0;
  for(var i=0;i<list.length;i++){
    var g = list[i];
    var pa = g.attributes.position.array, na = g.attributes.normal.array;
    var ua = g.attributes.uv ? g.attributes.uv.array : null;
    var ca = g.attributes.color ? g.attributes.color.array : null;
    var n = g.attributes.position.count, v, k;
    for(v=0; v<n; v++){
      pos.push(pa[v*3], pa[v*3+1], pa[v*3+2]);
      nor.push(na[v*3], na[v*3+1], na[v*3+2]);
      uvs.push(ua ? ua[v*2] : 0, ua ? ua[v*2+1] : 0);
      col.push(ca ? ca[v*3] : 1, ca ? ca[v*3+1] : 1, ca ? ca[v*3+2] : 1);
    }
    var ix = g.index;
    if(ix) for(k=0;k<ix.count;k++) ind.push(base + ix.getX(k));
    else   for(k=0;k<n;k++) ind.push(base + k);
    base += n;
    g.dispose();
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  out.setIndex(ind);
  out.computeBoundingSphere();
  return out;
}

/* 髪の束ひとつ。上端を原点に、下へ垂らす。
   断面は扁平（厚みは幅の 3 割）。丸い断面だと太さがそのまま棒に見える
   ——実際、直径 5.2cm のまっすぐな円柱 10 本で作っていたので、寄ると
   木の板を並べたようにしか見えなかった。
   fall は下へ行くほど +Z へ流れる量。頭の丸みから離して落とすのに使う。
   ph は束ごとの位相。同じ形が並ぶと櫛の歯に見えるのでずらす。 */
/* 体の汚れの階調。足元ほど暗く、末端ほど青い。
   照明ではなく頂点色に焼くので、姿勢が変わっても付いて回る。
   自己診断が「焼いた遮蔽」と区別できるよう、係数はここだけに置く。
   out に [r,g,b] の倍率を書き込む。 */
var BODY_TOP = 1.95;
function bodyDirt(y, out){
  var u = clamp(y / BODY_TOP, 0, 1);
  var f = 0.60 + 0.40*u;                     // 足元 0.60、頭 1.00
  out[0] = f;
  out[1] = f * (1 + 0.03*(1-u));             // 末端ほど血の気が引いて
  out[2] = f * (1 + 0.12*(1-u));             // 青みが差す
  return out;
}

function hairRibbon(len, wide, fall, ph){
  /* 分割数。束は厚みが幅の 3 割しかない扁平な帯なので、断面を 8 分割
     しても丸みは見えない。6 で足りる（実測：頭の髪 3,408 → 2,556 三角形、
     見た目の差は分からなかった）。 */
  var N = QC.detail ? 7 : 5, rows = [];
  /* 行は必ず y の小さいほうから並べる。loftGeo の蓋は
     「最初の行から下へ capA、最後の行から上へ capB」と決め打ちなので、
     根元から毛先へ（＝上から下へ）並べると蓋が二つとも束の内側を向き、
     巻き方向まで裏返る。i=0 を毛先、i=N を根元にする。 */
  for(var i=0;i<=N;i++){
    var u = 1 - i/N;                      // u は根元 0・毛先 1
    // 付け根と毛先を細く、中ほどを太く。毛先は一気に絞る
    var w = wide * (0.70 + 0.30*Math.sin(u*Math.PI)) * (1 - 0.62*u*u*u);
    rows.push({ y:-len*u,
                cx: Math.sin(u*3.3 + ph*1.7)*wide*0.55,
                cz: fall*u*u + Math.sin(u*4.1 + ph)*wide*0.5,
                rx: w, rz: w*0.30 });
  }
  /* 束の中の縦の筋。毛の集まりに見せる。
     蓋の大きさはメートルで指定する（割合ではない）。ここを 0.5 と 0.7 で
     書いたら束の先から 70cm の棘が生え、頭の上に黒い線が何本も突き抜けた。
     細いので正面からは気づかず、見上げて初めて分かった。 */
  return loftGeo(rows, QC.detail ? 6 : 5, function(th, v){
    return 1 + 0.13*Math.sin(th*3.0 + ph*5) * (0.35 + 0.65*(1-v));
  }, { capA:0.010, capB:0.004 });
}

function mergeTinted(parts){
  var pos = [], nor = [], uvs = [], col = [];
  var m4 = new THREE.Matrix4(), eu = new THREE.Euler(), cv = new THREE.Color();
  for(var i=0;i<parts.length;i++){
    var sp = parts[i], bg;
    if(sp.type === 'cyl'){
      bg = new THREE.CylinderGeometry(sp.r, sp.rb === undefined ? sp.r : sp.rb, sp.h, sp.seg || 10);
      if(sp.ax === 'x') bg.rotateZ(Math.PI/2);
      else if(sp.ax === 'z') bg.rotateX(Math.PI/2);
    }else{
      bg = new THREE.BoxGeometry(sp.w, sp.h, sp.d);
    }
    eu.set(sp.rx||0, sp.ry||0, sp.rz||0);
    m4.makeRotationFromEuler(eu);
    m4.setPosition(sp.x||0, sp.y||0, sp.z||0);
    bg.applyMatrix4(m4);
    /* 色は sRGB のつもりで書いた値なので、線形へ直してから頂点色に入れる。
       three r128 は色管理をしないため、直さないと 0x4a3f33 のような
       暗い色が「線形 29%」として扱われ、暗いつもりの物が全部明るく出る。 */
    cv.setHex(sp.c === undefined ? 0xffffff : sp.c).convertSRGBToLinear();
    var pa = bg.attributes.position.array, na = bg.attributes.normal.array,
        ua = bg.attributes.uv.array, ix = bg.index ? bg.index.array : null;
    if(ix) for(var k=0;k<ix.length;k++){
      var v = ix[k];
      pos.push(pa[v*3], pa[v*3+1], pa[v*3+2]);
      nor.push(na[v*3], na[v*3+1], na[v*3+2]);
      uvs.push(ua[v*2], ua[v*2+1]);
      col.push(cv.r, cv.g, cv.b);
    }
    bg.dispose();
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv',       new THREE.Float32BufferAttribute(uvs, 2));
  out.setAttribute('color',    new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

function buildWorld(){
  clearWorld();
  var d = DIFF[settings.diff];
  world.grid = genMaze(0.10);
  var g = world.grid;
  carveHalls(g, 5);
  var bigHall = carveHall(g);
  world.rooms = carveRooms(g, 8);
  world.rooms.push(bigHall);
  carveAlcoves(g, 10);

  /* --- 遮蔽の下地 ------------------------------------------------------
     追跡者に焼いたのと同じ考えを、部屋のほうにも入れる。
     ここまで壁も床も天井も一様な明るさで返っていたので、壁の根元と
     部屋の隅がまったく沈まず、書き割りを立てたように見えていた。
     光源は数個しか置けないのだから、光の届かなさは形から決めるしかない。

     格子ゲームなので光線を飛ばす必要はない。ある点の周りにどれだけ
     壁マスが詰まっているかを距離で重み付けして数えれば、それがそのまま
     「どれだけ囲まれているか」になる。実測 3ms。 */
  function solidAt(cx, cy){ return !inBounds(cx,cy) || g[idx(cx,cy)] === 1; }
  var AO_R = CELL * 1.55;
  function gridOcc(wx, wz, skx, sky){
    var c = worldToCell(wx, wz), occ = 0, wsum = 0;
    for(var oy=-2; oy<=2; oy++) for(var ox=-2; ox<=2; ox++){
      var gx = c.x+ox, gy = c.y+oy, wc = cellToWorld(gx, gy);
      var ddx = wc.x-wx, ddz = wc.z-wz;
      var w2 = 1 - Math.sqrt(ddx*ddx + ddz*ddz)/AO_R;
      if(w2 <= 0) continue;
      w2 *= w2;                                   // 近いマスほど強く効かせる
      wsum += w2;
      /* 壁の面を塗るときは、その面が乗っている壁マス自身を数から外す。
         入れたままだと、開けた廊下の壁でも自分のせいで真っ暗になり、
         隅と見分けがつかなくなる（実測：壁の平均が 0.565 まで沈んでいた）。 */
      if(gx === skx && gy === sky) continue;
      if(solidAt(gx, gy)) occ += w2;
    }
    return wsum > 0 ? occ/wsum : 0;
  }
  /* 平らな面に遮蔽を焼くには頂点が要る。1 枚板（頂点 4 つ）のままでは
     どこも同じ明るさにしかならないので、マス目に合わせて割る。 */
  function bakePlane(geo, k){
    var pa = geo.attributes.position, n = pa.count, col = new Float32Array(n*3);
    for(var i=0;i<n;i++){
      var ao = 1 - k * gridOcc(pa.getX(i), pa.getZ(i));
      var pc = worldToCell(pa.getX(i), pa.getZ(i));
      var zt = zoneTint(clamp(pc.x,0,GW-1), clamp(pc.y,0,GH-1));
      col[i*3] = ao*zt[0]; col[i*3+1] = ao*zt[1]; col[i*3+2] = ao*zt[2];
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  }

  // --- 床 ---
  /* 床と天井の分割。陰りの階調を持たせるためだけの分割なのに、
     1マス2分割だと床と天井で 15,376 三角形＝world 全体の 30% を使っていた。
     遮蔽の場は AO_R が 1.55 マスなのでマス単位で十分に拾える。
     実測：分割を半分にしても床の AO の範囲は 0.263〜1.030 で変わらず、
     平均が 0.702 → 0.688 になるだけ。三角形は 51,064 → 39,532。 */
  var fseg = 1;                                   // 1マスあたりの分割数
  var floorGeo = new THREE.PlaneGeometry(GW*CELL, GH*CELL, GW*fseg, GH*fseg);
  floorGeo.rotateX(-Math.PI/2);                   // 頂点をそのまま世界座標として読めるようにする
  /* 床も同じ。長尺シートは磨かれていて、斜めから見ると光が細長く
     伸びて映る。ここが艶消し一色だと、床がどこまでも同じ暗い面に
     なって奥行きが読めない。 */
  var floorMat = new THREE.MeshStandardMaterial({
    map: TEX.floor, normalMap: TEX.floorN || null, roughnessMap: TEX.floorR || null,
    roughness: TEX.floorR ? 1 : 0.94, metalness:0.02,
    color:0xffffff, vertexColors:true
  });
  if(TEX.floorN) floorMat.normalScale = new THREE.Vector2(0.6,0.6);
  bakePlane(floorGeo, 0.72);
  var floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = 0;
  floor.receiveShadow = !!QC.shadows;
  world.group.add(floor);

  // --- 天井 ---
  var ceilMat = new THREE.MeshStandardMaterial({ map: TEX.ceil, roughness:1, metalness:0,
                                                 vertexColors:true });
  var ceilGeo = new THREE.PlaneGeometry(GW*CELL, GH*CELL, GW*fseg, GH*fseg);
  ceilGeo.rotateX(Math.PI/2);
  // 天井は元から暗い。床と同じ強さで沈めると、見上げたときに真っ黒になる
  bakePlane(ceilGeo, 0.50);
  var ceil = new THREE.Mesh(ceilGeo, ceilMat);
  ceil.position.y = WALL_H;
  world.group.add(ceil);

  /* --- 壁 --------------------------------------------------------------
     以前は 1 マス 1 箱の InstancedMesh。ドローコールは 1 回で済むが、
       ・壁どうしが接する面まで律儀に描いていた（絶対に見えない）
       ・形が全マス共通なので、頂点ごとの陰りを持てない
     という二重の無駄があった。露出している面だけを 1 つのジオメトリに
     畳めば、ドローコールは 1 回のまま三角形が減り、頂点色も持てる。 */
  var wpos = [], wnor = [], wuv = [], wcol = [], widx = [];
  var WROW = QC.detail ? 5 : 3, WCOL = 3;         // 面の分割（縦・横）
  var DIRV = [[1,0],[-1,0],[0,1],[0,-1]];
  var x, y, faces = 0;
  for(y=0;y<GH;y++) for(x=0;x<GW;x++){
    if(g[idx(x,y)] !== 1) continue;
    var wc2 = cellToWorld(x,y), hf = CELL/2;
    for(var di=0; di<4; di++){
      var nx2 = x + DIRV[di][0], ny2 = y + DIRV[di][1];
      if(solidAt(nx2, ny2)) continue;             // 隣も壁なら、この面は永久に見えない
      faces++;
      // 面の張る 2 軸。u は面に沿って、v は上へ
      var ux = DIRV[di][1], uz = -DIRV[di][0];    // 法線を90°回した向き
      var ox2 = wc2.x + DIRV[di][0]*hf, oz2 = wc2.z + DIRV[di][1]*hf;
      // 面の両端で「入隅か」を見る。隣のマスの、さらに横が壁なら隅
      var e0 = solidAt(nx2 - ux, ny2 - uz) ? 1 : 0;
      var e1 = solidAt(nx2 + ux, ny2 + uz) ? 1 : 0;
      // 見た目を単調にしないための、マスごとの UV のずらしと反転
      var hsh = (x*7 + y*13 + di*5) & 3, flip = (hsh & 1) ? 1 : 0;
      var base = wpos.length/3;
      for(var r=0; r<WROW; r++) for(var c3=0; c3<WCOL; c3++){
        var fu = c3/(WCOL-1), fv = r/(WROW-1);    // 0..1
        var px2 = ox2 + ux*(fu-0.5)*CELL, pz2 = oz2 + uz*(fu-0.5)*CELL;
        var py2 = fv*WALL_H;
        wpos.push(px2, py2, pz2);
        wnor.push(DIRV[di][0], 0, DIRV[di][1]);
        wuv.push(flip ? 1-fu : fu, fv + hsh*0.25);
        /* 陰り。床と天井への接地、面の両端の入隅、そして面の手前に
           どれだけ壁が詰まっているかを足す。指数で落とすと、
           接地の線が「塗った帯」ではなく「にじんだ影」になる。 */
        var vy = 0.40*Math.exp(-py2/0.62) + 0.24*Math.exp(-(WALL_H-py2)/0.50);
        var edge = (fu < 0.5 ? e0*(1-fu*2) : e1*(fu-0.5)*2) * 0.34;
        // 面の前の空間がどれだけ塞がっているか（自分の乗っている壁は除く）
        var nc2 = cellToWorld(nx2, ny2);
        var amb = 0.40 * gridOcc((px2 + nc2.x)/2, (pz2 + nc2.z)/2, x, y);
        var ao2 = clamp(1 - vy - edge - amb, 0.16, 1);
        /* 根元の汚れ。暗さは vy で落としてあるが色は白いままだったので、
           壁がどこまでも清潔なタイルに見えていた。人の出入りする建物の
           壁は、モップ水と靴の跳ねで根元 30cm ほどが黄土色に染まる。
           赤は残し、緑と青だけ引くと、暗さと別に「汚れている」が出る。 */
        var db = Math.exp(-py2/0.30);
        // 区画の色調を掛ける。描画の回数は増えない
        var zt = zoneTint(x, y);
        wcol.push(ao2*zt[0],
                  ao2*zt[1]*(1 - 0.10*db),
                  ao2*zt[2]*(1 - 0.17*db));
      }
      for(var r2=0; r2<WROW-1; r2++) for(var c4=0; c4<WCOL-1; c4++){
        var a2 = base + r2*WCOL + c4, b2 = a2+1, c5 = a2+WCOL, d2 = c5+1;
        /* 面は開いている側を向く。巻き方向を間違えると背面カリングで
           壁が全部消える——最初この並びが逆で、10976 枚すべてが裏返って
           いた。暗いゲームなので目視では気づけない。自己診断で押さえる。 */
        widx.push(a2, b2, c5,  b2, d2, c5);
      }
    }
  }
  var wallGeo = new THREE.BufferGeometry();
  wallGeo.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3));
  wallGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(wnor, 3));
  wallGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(wuv, 2));
  wallGeo.setAttribute('color',    new THREE.Float32BufferAttribute(wcol, 3));
  wallGeo.setIndex(widx);
  wallGeo.computeBoundingSphere();
  /* 粗さはマップで決める（roughness はそれに掛かる係数なので 1）。
     0.92 の一枚岩だったので、懐中電灯を当てても艶がどこにも乗らず、
     タイルが紙に印刷された模様に見えていた。 */
  var wm = new THREE.MeshStandardMaterial({
    map: TEX.wall, normalMap: TEX.wallN || null, roughnessMap: TEX.wallR || null,
    roughness: TEX.wallR ? 1 : 0.92, metalness:0.03,
    color:0xdfe4e0, vertexColors:true
  });
  if(TEX.wallN) wm.normalScale = new THREE.Vector2(0.85,0.85);
  var walls = new THREE.Mesh(wallGeo, wm);
  walls.frustumCulled = false;
  walls.castShadow = !!QC.shadows;
  walls.receiveShadow = !!QC.shadows;
  world.walls = walls;
  world.wallFaces = faces;
  world.mats = { floor:floorMat, ceil:ceilMat, wall:wm };     // 写真素材の差し替え先（第 7 章 applyPhoto）
  world.group.add(walls);

  /* --- 建物の造作 ------------------------------------------------------
     壁・床・天井が平らな面のまま突き合わさっているので、廊下が
     「箱の内側」にしか見えなかった。実際の病棟には必ず、
     壁の足元に幅木が回っていて、天井には配管とケーブルラックが走る。
     この 2 つを入れるだけで、同じ間取りが「建物」として読めるようになる。

     どちらも壁と同じく 1 つのジオメトリに畳むので、ドローコールは
     2 回増えるだけ。当たり判定には一切関与しない（歩ける場所は変えない）。 */
  var trimPos = [], trimNor = [], trimUv = [], trimIdx = [];
  function quad(px, py, pz, ax, ay, az, bx, by, bz, nx, ny, nz, uu, vv){
    var base = trimPos.length/3;
    var pts = [[0,0],[1,0],[1,1],[0,1]];
    for(var q=0; q<4; q++){
      var s2 = pts[q][0], t2 = pts[q][1];
      trimPos.push(px + ax*s2 + bx*t2, py + ay*s2 + by*t2, pz + az*s2 + bz*t2);
      trimNor.push(nx, ny, nz);
      trimUv.push(s2*uu, t2*vv);
    }
    trimIdx.push(base, base+1, base+2, base, base+2, base+3);
  }
  var TRIM_H = 0.24, TRIM_D = 0.055;      // 幅木の高さと壁からの出
  for(y=0;y<GH;y++) for(x=0;x<GW;x++){
    if(g[idx(x,y)] !== 1) continue;
    var wc3 = cellToWorld(x,y), hf3 = CELL/2;
    for(var d3=0; d3<4; d3++){
      var nx3 = x + DIRV[d3][0], ny3 = y + DIRV[d3][1];
      if(solidAt(nx3, ny3)) continue;
      var dx3 = DIRV[d3][0], dz3 = DIRV[d3][1];
      var ux3 = DIRV[d3][1], uz3 = -DIRV[d3][0];
      // 幅木の前面（壁から TRIM_D だけ手前）と、上端の水平な面
      var ox3 = wc3.x + dx3*(hf3 + TRIM_D) - ux3*hf3;
      var oz3 = wc3.z + dz3*(hf3 + TRIM_D) - uz3*hf3;
      quad(ox3, 0, oz3, ux3*CELL, 0, uz3*CELL, 0, TRIM_H, 0, dx3, 0, dz3, 2.2, 0.34);
      quad(ox3, TRIM_H, oz3, ux3*CELL, 0, uz3*CELL, -dx3*TRIM_D, 0, -dz3*TRIM_D, 0, 1, 0, 2.2, 0.12);
    }
  }
  /* --- 壁の痕跡 ---
     壁が均一に汚れているだけで「ここで何かがあった」場所が無かった。
     露出している壁面のうち何枚かに、血・手形・爪痕・水染みを貼る。
     どれを貼るか・どこに貼るかはマスの座標から決める（乱数を引くと
     同じ種でも間取りが変わる）。壁から 1.2cm 浮かせて奥行き争いを避ける。 */
  var dcPos = [], dcNor = [], dcUv = [], dcIdx = [], dcN = 0;
  for(y=0;y<GH;y++) for(x=0;x<GW;x++){
    if(g[idx(x,y)] !== 1) continue;
    var wc4 = cellToWorld(x,y), hf4 = CELL/2;
    for(var d5=0; d5<4; d5++){
      var nx5 = x + DIRV[d5][0], ny5 = y + DIRV[d5][1];
      if(solidAt(nx5, ny5)) continue;
      var hs5 = (x*73856093 ^ y*19349663 ^ d5*83492791) >>> 0;
      if((hs5 % 100) >= 26) continue;                 // 4 面に 1 枚くらい
      var kind = (hs5 >> 7) % 4;
      var dw = CELL * (0.26 + ((hs5 >> 11) % 7) * 0.035);
      var dh = dw * (kind === 3 ? 1.35 : 1.0);        // 水染みは縦長
      var cu = ((hs5 >> 15) % 100)/100 * 0.56 - 0.28; // 面内の左右位置
      var cvv = kind === 3 ? 0.62 : (0.24 + ((hs5 >> 21) % 100)/100 * 0.42);
      var ux5 = DIRV[d5][1], uz5 = -DIRV[d5][0];
      var ox5 = wc4.x + DIRV[d5][0]*(hf4 + 0.012) + ux5*cu*CELL;
      var oz5 = wc4.z + DIRV[d5][1]*(hf4 + 0.012) + uz5*cu*CELL;
      var oy5 = cvv * WALL_H;
      var base5 = dcPos.length/3;
      var au = (kind & 1) ? 0.5 : 0, av = (kind & 2) ? 0.5 : 0;
      var q = [[-0.5,-0.5],[0.5,-0.5],[0.5,0.5],[-0.5,0.5]];
      for(var qi=0; qi<4; qi++){
        dcPos.push(ox5 + ux5*q[qi][0]*dw, oy5 + q[qi][1]*dh, oz5 + uz5*q[qi][0]*dw);
        // 法線は貼った壁面と同じ。計算に任せると 4 点が同一平面なので不定になる
        dcNor.push(DIRV[d5][0], 0, DIRV[d5][1]);
        dcUv.push(au + (q[qi][0]+0.5)*0.5, av + (q[qi][1]+0.5)*0.5);
      }
      dcIdx.push(base5, base5+1, base5+2, base5, base5+2, base5+3);
      dcN++;
    }
  }
  if(dcN && TEX.decal){
    var dcGeo = new THREE.BufferGeometry();
    dcGeo.setAttribute('position', new THREE.Float32BufferAttribute(dcPos, 3));
    dcGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(dcUv, 2));
    dcGeo.setIndex(dcIdx);
    dcGeo.setAttribute('normal', new THREE.Float32BufferAttribute(dcNor, 3));
    /* 痕跡は壁に付いた「物」であって光源ではない。MeshBasicMaterial は
       光をまったく受けないので、暗い廊下では壁より明るく、照らすと壁より
       暗いという逆の振る舞いをしていた。実際、遠くの壁に淡い斑が
       浮かんで迷彩のように見えていた原因がこれ。壁と同じ照明を受けさせる。
       面は壁と同一平面なので、法線は壁と同じ向きに揃う。 */
    var dcMat = new THREE.MeshStandardMaterial({
      map:TEX.decal, transparent:true, depthWrite:false, opacity:0.95,
      roughness:0.86, metalness:0, color:0xffffff,
      polygonOffset:true, polygonOffsetFactor:-2, polygonOffsetUnits:-2
    });
    var dcMesh = new THREE.Mesh(dcGeo, dcMat);
    dcMesh.frustumCulled = false;
    dcMesh.renderOrder = 1;
    world.group.add(dcMesh);
  }
  world.decals = dcN;

  var trimGeo = new THREE.BufferGeometry();
  trimGeo.setAttribute('position', new THREE.Float32BufferAttribute(trimPos, 3));
  trimGeo.setAttribute('normal',   new THREE.Float32BufferAttribute(trimNor, 3));
  trimGeo.setAttribute('uv',       new THREE.Float32BufferAttribute(trimUv, 2));
  trimGeo.setIndex(trimIdx);
  trimGeo.computeBoundingSphere();
  /* 壁の根元は焼いた遮蔽でいちばん暗い帯になっている。そこに壁と同じ
     明度の幅木を置いても completely 埋もれるので、少し明るい塗装色にする
     （病棟の幅木は塩ビの巾木で、壁より艶がある）。 */
  var trimMat = new THREE.MeshStandardMaterial({
    map: TEX.wall, color:0x9aa096, roughness:0.46, metalness:0.10
  });
  var trim = new THREE.Mesh(trimGeo, trimMat);
  trim.frustumCulled = false;
  world.group.add(trim);

  /* 天井の配管。通路が 2 マス以上まっすぐ続くところにだけ通す。
     曲がり角ごとに切れると、部屋の隅で管が宙に浮いて見える。 */
  var pipeSpecs = [];
  /* 金属らしさは映り込みで出す。明度は落とす——0x585c58 に metalness 0.72 だと
     天井の光を拾って白い梁のように見えた。 */
  var pipeMat = regEnvMat(new THREE.MeshStandardMaterial({
    color:SRGB(0x33372f), roughness:0.52, metalness:0.55
  }));
  var runSeen = {};
  for(y=1;y<GH-1;y++) for(x=1;x<GW-1;x++){
    if(g[idx(x,y)] !== 0) continue;
    for(var ax2=0; ax2<2; ax2++){
      var stepX = ax2 ? 0 : 1, stepZ = ax2 ? 1 : 0;
      // この向きの走りの先頭か（手前が壁 or 別の走りの途中でない）
      if(g[idx(x-stepX, y-stepZ)] === 0) continue;
      /* 走りの長さと「廊下らしさ」を同時に測る。
         長さだけで判定していたら、開けた広間では縦にも横にも条件を
         満たしてしまい、天井に配管の格子が組まれる絵になっていた。
         両隣が壁のマス（＝1マス幅の廊下）が過半でなければ通さない。 */
      var len = 0, cx3 = x, cy3 = y, narrow = 0;
      while(inBounds(cx3,cy3) && g[idx(cx3,cy3)] === 0){
        if(solidAt(cx3 - stepZ, cy3 - stepX) && solidAt(cx3 + stepZ, cy3 + stepX)) narrow++;
        len++; cx3 += stepX; cy3 += stepZ;
      }
      if(len < 3) continue;                       // 短い走りには通さない
      if(narrow < len * 0.45) continue;            // 広間には通さない
      var key = ax2 + ':' + x + ':' + y;
      if(runSeen[key]) continue;
      runSeen[key] = 1;
      var a3 = cellToWorld(x, y), b3 = cellToWorld(x + stepX*(len-1), y + stepZ*(len-1));
      var mid = { x:(a3.x+b3.x)/2, z:(a3.z+b3.z)/2 };
      var L3 = Math.abs(stepX ? (b3.x-a3.x) : (b3.z-a3.z)) + CELL;
      // 太い管と細い管を少しずらして 2 本。1 本だと配管に見えない
      /* 通路の真ん中の天井に太い管を通すと、視界のど真ん中を横切って
         うるさい。実際の配管も壁際に寄せて走る。細い管を 2 本、
         片側の壁沿いに並べる。 */
      for(var pk=0; pk<2; pk++){
        var off = -CELL*0.36 + pk*0.17, rad = pk ? 0.036 : 0.052;
        pipeSpecs.push({
          x: mid.x + (stepX ? 0 : off), z: mid.z + (stepX ? off : 0),
          y: WALL_H - 0.17 - pk*0.02, len:L3, rad:rad, along:stepX ? 0 : 1
        });
      }
    }
  }
  if(pipeSpecs.length){
    var pipeGeo = new THREE.CylinderGeometry(1, 1, 1, QC.detail ? 10 : 6, 1, true);
    var pipeMesh = new THREE.InstancedMesh(pipeGeo, pipeMat, pipeSpecs.length);
    var pd = new THREE.Object3D();
    for(var pi3=0; pi3<pipeSpecs.length; pi3++){
      var S3 = pipeSpecs[pi3];
      pd.position.set(S3.x, S3.y, S3.z);
      pd.rotation.set(S3.along ? Math.PI/2 : 0, 0, S3.along ? 0 : Math.PI/2);
      pd.scale.set(S3.rad, S3.len, S3.rad);
      pd.updateMatrix();
      pipeMesh.setMatrixAt(pi3, pd.matrix);
    }
    pipeMesh.instanceMatrix.needsUpdate = true;
    pipeMesh.frustumCulled = false;
    world.group.add(pipeMesh);
    world.pipes = pipeSpecs.length;
  }else{
    world.pipes = 0;
  }

  // --- 空きマス一覧 ---
  var open = [];
  for(y=1;y<GH-1;y++) for(x=1;x<GW-1;x++) if(g[idx(x,y)]===0) open.push({x:x,y:y});

  // 開始セルをランダム化する。出口＝開始点からの最遠点なので、開始を (1,1) に
  // 固定すると出口が必ず右下隅へ吸い寄せられ、周回時に方角も道のりも変わらなくなる。
  var startCand = [];
  for(var sy2=1; sy2<GH-1; sy2+=2)
    for(var sx2=1; sx2<GW-1; sx2+=2)
      if(g[idx(sx2,sy2)] === 0) startCand.push({x:sx2, y:sy2});

  var startC = {x:1, y:1}, field = bfsField(g, 1, 1), bestFar = -1;
  for(var st2=0; st2<12 && startCand.length; st2++){
    var cand2 = startCand[(rnd()*startCand.length)|0];
    var f2 = bfsField(g, cand2.x, cand2.y);
    var mx2 = -1;
    for(var fi2=0; fi2<f2.length; fi2++) if(f2[fi2] > mx2) mx2 = f2[fi2];
    if(mx2 > bestFar){ bestFar = mx2; startC = cand2; field = f2; }
    if(mx2 >= 52) break;              // 十分な道のりが取れた時点で打ち切る
  }

  // 到達可能なマスのみ対象
  var reach = open.filter(function(c){ return field[idx(c.x,c.y)] >= 0; });

  // --- 出口＝最遠地点 ---
  var far = reach[0], best = -1;
  reach.forEach(function(c){
    var dd = field[idx(c.x,c.y)];
    if(dd > best){ best = dd; far = c; }
  });
  // 隣接する壁を探し、その面に扉を取り付ける（通路の真ん中に浮かせない）
  var EDIRS = [[1,0],[-1,0],[0,1],[0,-1]];
  var wallDir = null;
  for(var wdi=0; wdi<4; wdi++){
    var wnx = far.x + EDIRS[wdi][0], wny = far.y + EDIRS[wdi][1];
    if(inBounds(wnx, wny) && g[idx(wnx, wny)] === 1){ wallDir = EDIRS[wdi]; break; }
  }
  if(!wallDir) wallDir = [0,-1];
  var ew = cellToWorld(far.x, far.y);              // 通路側＝安全な操作・ワープ位置
  var doorX = ew.x + wallDir[0] * (CELL/2 - 0.11); // 壁面にぴたりと付ける
  var doorZ = ew.z + wallDir[1] * (CELL/2 - 0.11);
  var exitGrp = new THREE.Group();
  var doorMat = new THREE.MeshStandardMaterial({ color:SRGB(0x1d2a26), map:TEX.grunge || null,
    emissive:0x8c2626, emissiveIntensity:0.7, roughness:0.6 });
  var door = new THREE.Mesh(new THREE.BoxGeometry(CELL*0.72, WALL_H*0.82, 0.22), doorMat);
  door.position.set(0, WALL_H*0.41, 0);
  exitGrp.add(door);
  var signMat = new THREE.MeshBasicMaterial({ color:0x8c2626 });
  var sign = new THREE.Mesh(new THREE.PlaneGeometry(CELL*0.5, 0.22), signMat);
  sign.position.set(0, WALL_H*0.9, 0.16);
  exitGrp.add(sign);
  exitGrp.position.set(doorX, 0, doorZ);
  exitGrp.rotation.y = Math.atan2(-wallDir[0], -wallDir[1]);   // 正面を通路側へ向ける
  world.group.add(exitGrp);
  var exitLight = new THREE.PointLight(0x8c2626, 1.1, 9, 2);
  exitLight.position.set(doorX - wallDir[0]*0.5, WALL_H*0.7, doorZ - wallDir[1]*0.5);
  scene.add(exitLight);
  world.exitLight = exitLight;
  world.exit = {
    cell:far,
    x:ew.x, z:ew.z,                 // 操作・ワープ用の安全な通路側の位置
    doorX:doorX, doorZ:doorZ,       // 見た目の扉（音もここから鳴らす）
    dir:wallDir,
    group:exitGrp, door:doorMat, sign:signMat, open:false
  };
  world.endgame = false;

  // --- 配置候補（プレイヤーからも出口からも離れた場所を優先） ---
  var pool = reach.filter(function(c){
    var dd = field[idx(c.x,c.y)];
    return dd > 6 && !(c.x===far.x && c.y===far.y);
  });
  // シャッフル
  for(var i=pool.length-1;i>0;i--){ var j=(rnd()*(i+1))|0; var t=pool[i]; pool[i]=pool[j]; pool[j]=t; }

  var used = {};
  function take(minSep){
    for(var k=0;k<pool.length;k++){
      var c = pool[k];
      var key = c.x+','+c.y;
      if(used[key]) continue;
      var ok = true;
      for(var uk in used){
        var p = uk.split(','), ux=+p[0], uy=+p[1];
        if(Math.abs(ux-c.x)+Math.abs(uy-c.y) < minSep){ ok=false; break; }
      }
      if(!ok) continue;
      used[key] = true;
      return c;
    }
    // 分離条件を満たせない場合は未使用の任意マス
    for(var m=0;m<pool.length;m++){
      var cc = pool[m], kk = cc.x+','+cc.y;
      if(!used[kk]){ used[kk]=true; return cc; }
    }
    return null;
  }

  /* --- カルテ ---
     厚さ 3cm の板が 1 枚浮いているだけだった。集めることが目的の物なので、
     手に取る前から「書類の綴り」だと分かる形にする。
     台紙・はみ出た用紙の束・金具・背の帯・角の折れ、の 5 要素。 */
  var recGeo = mergeTinted([
    { w:0.42, h:0.022, d:0.58, y:0,      c:0x8d7f5e },            // 台紙（マニラ紙）
    /* 用紙の反射率。0xe6e2d4 は線形で 0.79——白い塗料（0.7）より白く、
       新雪に近い。40 年放置された病棟のカルテがそれでは光りすぎる。
       黄ばんだ紙の実測に近い 0.55 前後まで落とす。 */
    { w:0.39, h:0.020, d:0.55, y:0.021, x:0.008, z:-0.006, c:0xc9c4b4 }, // 中の用紙
    { w:0.40, h:0.014, d:0.54, y:0.036, x:-0.006, z:0.010, c:0xbdb7a6 }, // ずれた1枚
    { w:0.030,h:0.016, d:0.58, x:-0.196, y:0.016, c:0x6b6047 },   // 背の帯
    { w:0.13, h:0.012, d:0.045, y:0.046, z:-0.245, c:0x9aa0a2 },  // 綴じ金具
    { type:'cyl', ax:'z', r:0.010, h:0.10, y:0.046, z:-0.268, c:0x9aa0a2 }
  ]);
  for(var r=0;r<d.records;r++){
    var c = take(5);
    if(!c) break;
    var w = cellToWorld(c.x,c.y);
    /* 自己発光は「遠くから気づける」ためのものだが、0.42 も入れると
       材質の色より発光が勝って、どの拾得物も同じ白い塊になっていた
       （紺色の電池胴ですら白く出ていた）。遠距離の視認は加算スプライトが
       受け持っているので、ここは形が沈まない程度まで落とす。 */
    /* 汚れを貼る。頂点色で色分けしただけの面は、寄って拾うときに
       「無地の板を重ねた物」に見える。古い紙の斑としても効く。 */
    var mat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true,
      map:TEX.grunge || null,
      /* 発光を 0.13 も入れると、暗がりでは拡散反射より発光が勝って、
         マニラ紙の色が消えて一様な青緑の板になる。0.09 まで落とす
         （遠くからの視認は加算スプライトが受け持っている）。 */
      emissive:0x6fbfa8, emissiveIntensity:0.09, roughness:0.72, metalness:0.04 });
    var m = new THREE.Mesh(recGeo, mat);
    m.position.set(w.x, 0.9, w.z);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glowG, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.55
    }));
    spr.scale.set(2.2,2.2,1); spr.position.copy(m.position);
    world.group.add(m); world.group.add(spr);
    world.records.push({ mesh:m, spr:spr, mat:mat, x:w.x, z:w.z, taken:false, phase:rnd()*TAU });
  }

  /* --- 予備電池 ---
     無地の円柱 1 本だった。単一形状の乾電池は、胴のラベル・上下の
     金属端子・正極の出っ張りで一目で分かる。部品はどれも小さいが、
     暗がりで拾うとき「電池だ」と即断できるかどうかが変わる。 */
  var batGeo = mergeTinted([
    { type:'cyl', r:0.088, h:0.255, y:0,      c:0x2f3138 },   // 胴
    { type:'cyl', r:0.090, h:0.130, y:-0.010, c:0x8a5f24 },   // ラベルの帯
    { type:'cyl', r:0.084, h:0.016, y:0.132,  c:0xb9b2a2 },   // 上の端子
    { type:'cyl', r:0.038, h:0.024, y:0.148,  c:0xcfc7b4 },   // 正極の出っ張り
    { type:'cyl', r:0.086, h:0.012, y:-0.132, c:0xa89f8e }    // 下の端子
  ]);
  for(var b=0;b<d.batteries + (d.batteries2||0);b++){
    var cb = take(3);
    if(!cb) break;
    var wb = cellToWorld(cb.x,cb.y);
    var bmat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true,
      map:TEX.grunge || null,
      emissive:0xe8a33d, emissiveIntensity:0.10, roughness:0.46, metalness:0.45 });
    var bm = new THREE.Mesh(batGeo, bmat);
    bm.position.set(wb.x, 0.62, wb.z);
    var bs = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glowW, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.4
    }));
    bs.scale.set(1.5,1.5,1); bs.position.copy(bm.position);
    world.group.add(bm); world.group.add(bs);
    world.batteries.push({ mesh:bm, spr:bs, x:wb.x, z:wb.z, taken:false, phase:rnd()*TAU });
  }

  // --- 鍵：非常口の扉を開けるために要る ---
  var keyCell = take(4);
  if(keyCell){
    var kw = cellToWorld(keyCell.x, keyCell.y);
    /* 自己発光 0.18 は、線形で (0.13, 0.11, 0.03) を全画素に足すことになる。
       暗い廊下では金属の映り込み（真鍮の反射率 0.6 前後 × 環境の明るさ）を
       上回ってしまい、鏡のはずの鍵が「一様なクリーム色の板」になっていた。
       遠くからの視認は加算スプライトが受け持っているので、ここは
       形が沈まない程度まで落とす。 */
    var keyMat = regEnvMat(new THREE.MeshStandardMaterial({
      color:SRGB(0xd8c77a), emissive:0xb89b2e, emissiveIntensity:0.05,
      roughness:0.34, metalness:0.85, envMapIntensity:2.0
    }));
    /* 鍵。3 つの部品を別メッシュで置いていたのを 1 つに畳む。
       ついでに軸を丸棒にし、歯を 2 枚にして、頭にタグを下げる
       （病棟の鍵には必ず札が付いている）。 */
    var keyGrp = new THREE.Group();
    keyGrp.add(new THREE.Mesh(mergeTinted([
      { type:'cyl', ax:'z', r:0.021, h:0.34, c:0xd8c77a },          // 軸
      { w:0.048, h:0.105, d:0.052, y:-0.052, z:-0.115, c:0xd8c77a },// 歯（大）
      { w:0.048, h:0.070, d:0.040, y:-0.035, z:-0.028, c:0xd8c77a },// 歯（小）
      { type:'cyl', ax:'z', r:0.030, h:0.020, z:0.155, c:0xc9b76c } // 頭の座
    ]), keyMat));
    var kr = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.022, 6, 12), keyMat);
    kr.position.z = 0.22; kr.rotation.y = Math.PI/2; keyGrp.add(kr);
    var tagMat = new THREE.MeshStandardMaterial({
      color:0xc8c2ac, emissive:0x2a2a22, emissiveIntensity:0.4, roughness:0.85
    });
    var ktag = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, 0.006), tagMat);
    ktag.position.set(0, -0.13, 0.235); keyGrp.add(ktag);
    keyGrp.position.set(kw.x, 0.85, kw.z);
    var keySpr = new THREE.Sprite(new THREE.SpriteMaterial({
      map:TEX.glowW, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.5
    }));
    keySpr.scale.set(2.0, 2.0, 1); keySpr.position.copy(keyGrp.position);
    world.group.add(keyGrp); world.group.add(keySpr);
    world.key = { grp:keyGrp, spr:keySpr, x:kw.x, z:kw.z, taken:false, phase:rnd()*TAU };
  }

  /* --- 施錠された扉：非常口へ入る手前の通路をふさぐ ---
     collideMove は施錠中「非常口のマス全体」を通行不可にする。ところが扉の板を
     1 面にしか置いていなかったため、非常口のマスに開いた隣がもう一方向あると、
     そちら側は「見た目は素通しの通路なのに進めない」＝見えない壁になっていた。
     実測で 40 本中 13 本（33%）で発生し、3 方向のものもあった。
     通行できる面すべてに板を置いて、見た目と当たり判定を一致させる。 */
  var preCell = null, lockDirs = [];
  for(var pdi=0; pdi<4; pdi++){
    var pnx = far.x + EDIRS[pdi][0], pny = far.y + EDIRS[pdi][1];
    if(inBounds(pnx, pny) && g[idx(pnx, pny)] === 0){
      lockDirs.push(EDIRS[pdi]);
      if(!preCell) preCell = { x:pnx, y:pny, dir:EDIRS[pdi] };
    }
  }
  if(preCell){
    var lockX = ew.x + preCell.dir[0]*(CELL/2);
    var lockZ = ew.z + preCell.dir[1]*(CELL/2);
    /* 施錠扉。通路幅いっぱいの無地の板 1 枚だった。しかも metalness 0.55 で
       映り込みの下駄が拡散反射を上回り、近づくと画面が真っ白な壁で埋まる
       （小物と同じ罠）。鍵を使いに来る＝必ず正面から見る扉なので、
       両開きの合わせ目・下の蹴込み板・網入りガラスの小窓・蝶番まで入れる。
       この扉は焼き固めないので頂点色を使ってよい。 */
    /* 扉はビームに正対する唯一の大きな平面で、N·L が 1 になる。
       壁が斜めで N·L 0.1 前後なのに対して 10 倍の光を受けるので、
       無地のままだと「明るいクリーム色の板」になる（実際そう見えた。
       画素で 181〜210）。什器と同じ汚れを貼って、面の中に濃淡を作る。 */
    var lockMat = new THREE.MeshStandardMaterial({
      color:0xffffff, vertexColors:true, map:TEX.grunge || null,
      roughnessMap:TEX.grungeR || null,
      roughness:TEX.grungeR ? 1 : 0.62, metalness:0.14,
      emissive:0x2a1408, emissiveIntensity:0.30
    });
    var LW = CELL*0.94, LH = WALL_H*0.92;
    var leafSpecs = [];
    for(var lf=0; lf<2; lf++){
      var cxo = (lf ? 1 : -1) * LW*0.25;
      leafSpecs.push({ w:LW*0.485, h:LH, d:0.16, x:cxo, y:LH/2, c:0x4b5049 });        // 扉本体
      leafSpecs.push({ w:LW*0.44, h:0.30, d:0.175, x:cxo, y:0.28, c:0x3a3f39 });      // 蹴込み板
      leafSpecs.push({ w:LW*0.22, h:0.52, d:0.19, x:cxo, y:LH*0.66, c:0x161c1a });    // 小窓
      leafSpecs.push({ w:LW*0.235, h:0.545, d:0.17, x:cxo, y:LH*0.66, c:0x565b53 });  // 窓枠
      for(var hgz=0; hgz<3; hgz++)
        leafSpecs.push({ w:0.07, h:0.20, d:0.20,
                         x:cxo + (lf?1:-1)*LW*0.225, y:0.45 + hgz*LH*0.30, c:0x2e332e });
    }
    leafSpecs.push({ w:0.05, h:LH, d:0.185, y:LH/2, c:0x1b201d });                    // 中央の合わせ目
    leafSpecs.push({ w:LW, h:0.10, d:0.19, y:LH, c:0x3a3f39 });                       // 上枠
    var leafGeo = mergeTinted(leafSpecs);
    var lockGrp = new THREE.Group();
    for(var ldi=0; ldi<lockDirs.length; ldi++){
      var ld = lockDirs[ldi];
      var leaf = new THREE.Group();
      var lg = new THREE.Mesh(leafGeo, lockMat);
      leaf.add(lg);
      // 取っ手は手前の面だけに付ける（開けに来る側）
      if(ldi === 0){
        var handle = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.26),
          regEnvMat(new THREE.MeshStandardMaterial({ color:SRGB(0xc9b56a), metalness:0.9, roughness:0.3 })));
        handle.position.set(CELL*0.3, WALL_H*0.42, 0.12); leaf.add(handle);
      }
      leaf.position.set(ld[0]*(CELL/2), 0, ld[1]*(CELL/2));
      leaf.rotation.y = Math.atan2(ld[0], ld[1]);
      lockGrp.add(leaf);
    }
    lockGrp.position.set(ew.x, 0, ew.z);
    world.group.add(lockGrp);
    world.lockDoor = {
      cell:{ x:far.x, y:far.y },       // 施錠中はこのマスへ入れない
      x:lockX, z:lockZ, group:lockGrp, mat:lockMat, open:false,
      // 開けに行く先。扉の板はマスの境界にあり、そこを目標にすると経路探索が
      // 除外している非常口のマス側へ丸められて到達不能になることがある
      preCell:{ x:preCell.x, y:preCell.y }
    };
  }

  // --- 電源レバー：入れると病棟の明かりが戻る（が、大きな音が出る） ---
  var leverCell = take(4);
  if(leverCell){
    var lvw = cellToWorld(leverCell.x, leverCell.y);
    var lvDir = [0,-1];
    for(var vdi=0; vdi<4; vdi++){
      var vnx = leverCell.x + EDIRS[vdi][0], vny = leverCell.y + EDIRS[vdi][1];
      if(inBounds(vnx, vny) && g[idx(vnx, vny)] === 1){ lvDir = EDIRS[vdi]; break; }
    }
    var boxMat = new THREE.MeshStandardMaterial({ color:0x3c4a3f, roughness:0.7, metalness:0.4 });
    var lvGrp = new THREE.Group();
    var panel = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.8, 0.18), boxMat);
    panel.position.y = 1.35; lvGrp.add(panel);
    var lvMat = new THREE.MeshStandardMaterial({ color:0x8c2626, emissive:0x8c2626, emissiveIntensity:0.6 });
    var handleL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.34, 0.07), lvMat);
    handleL.position.set(0, 1.35, 0.16);
    handleL.rotation.x = -0.7;
    lvGrp.add(handleL);
    lvGrp.position.set(lvw.x + lvDir[0]*(CELL/2 - 0.16), 0, lvw.z + lvDir[1]*(CELL/2 - 0.16));
    lvGrp.rotation.y = Math.atan2(-lvDir[0], -lvDir[1]);
    world.group.add(lvGrp);
    world.lever = { x:lvw.x, z:lvw.z, group:lvGrp, handle:handleL, mat:lvMat, on:false };
  }

  // --- 隠れ場所：通路のロッカーと、部屋のベッドの下 ---
  /* 隠れ場所の什器にも、通路の物と同じ汚れを貼る。ここだけ無地のまま
     だったので、廊下でロッカーだけが真新しい水色の箱に見えていた。
     シーツの色 0xb9b6a6 は線形で 0.53——白い塗料（0.7）に迫る反射率で、
     40 年放置された病棟の寝具としては明るすぎた。0.3 前後へ落とす。 */
  var GT2 = TEX.grunge || null, GR2 = TEX.grungeR || null;
  var lockerMat = regEnvMat(new THREE.MeshStandardMaterial({
    color:SRGB(0x46524d), map:GT2, roughnessMap:GR2,
    roughness:GR2?1:0.6, metalness:0.5 }));
  var slatMat   = new THREE.MeshStandardMaterial({ color:SRGB(0x2a322e), map:GT2, roughness:0.9 });
  var bedMat    = new THREE.MeshStandardMaterial({ color:SRGB(0x5c5f58), map:GT2, roughnessMap:GR2,
                                                   roughness:GR2?1:0.85 });
  var sheetMat  = new THREE.MeshStandardMaterial({ color:SRGB(0xa9a698), map:GT2, roughness:0.95 });

  function wallCellNear(){
    for(var att=0; att<60; att++){
      var c = reach[(rnd()*reach.length)|0];
      var kk = c.x + ',' + c.y;
      if(used[kk]) continue;
      if(c.x === startC.x && c.y === startC.y) continue;
      if(c.x === far.x && c.y === far.y) continue;
      for(var wdj=0; wdj<4; wdj++){
        var wx2 = c.x + EDIRS[wdj][0], wy2 = c.y + EDIRS[wdj][1];
        if(inBounds(wx2, wy2) && g[idx(wx2, wy2)] === 1){
          used[kk] = true;
          return { cell:c, dir:EDIRS[wdj] };
        }
      }
    }
    return null;
  }

  for(var lk=0; lk<9; lk++){
    var spot = wallCellNear();
    if(!spot) break;
    var sw2 = cellToWorld(spot.cell.x, spot.cell.y);
    /* ロッカー。無地の箱に細い羽根板を 3 枚貼っただけで、暗がりでは
       ただの白い直方体だった。扉の合わせ目・蝶番・取っ手・番号札・
       足元の台輪を足す。焼き固め（mergeMeshes）は position/normal/uv しか
       運ばないので、ここで頂点色を使ってはいけない（材質のまま増やす）。 */
    var lgrp = new THREE.Group();
    var lbody = new THREE.Mesh(new THREE.BoxGeometry(0.92, 2.05, 0.62), lockerMat);
    lbody.position.y = 1.025; lgrp.add(lbody);
    // 扉の合わせ目。縦に 1 本入るだけで「開く物」に見える
    var seam = new THREE.Mesh(new THREE.BoxGeometry(0.022, 1.86, 0.014), slatMat);
    seam.position.set(0, 1.03, 0.312); lgrp.add(seam);
    // 上下の縁。天板と台輪が出っ張ると、床から生えた板ではなくなる
    var lcap = new THREE.Mesh(new THREE.BoxGeometry(0.98, 0.055, 0.68), slatMat);
    lcap.position.y = 2.06; lgrp.add(lcap);
    var lbase = new THREE.Mesh(new THREE.BoxGeometry(0.96, 0.10, 0.66), slatMat);
    lbase.position.y = 0.05; lgrp.add(lbase);
    for(var sl2=0; sl2<4; sl2++){
      var slat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.042, 0.024), slatMat);
      slat.position.set(0, 1.70 - sl2*0.115, 0.316);
      lgrp.add(slat);
    }
    // 蝶番 2 個と取っ手
    for(var hg=0; hg<2; hg++){
      var hinge = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.13, 0.05), slatMat);
      hinge.position.set(-0.455, 1.62 - hg*1.05, 0.28); lgrp.add(hinge);
    }
    var grip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.19, 0.055), slatMat);
    grip.position.set(0.30, 1.02, 0.345); lgrp.add(grip);
    // 番号札。白い小片が 1 枚あるだけで、同じ物が並んでいる感じが消える
    var plate = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.10, 0.008), sheetMat);
    plate.position.set(-0.20, 1.80, 0.316); lgrp.add(plate);
    lgrp.position.set(sw2.x + spot.dir[0]*(CELL/2 - 0.36), 0, sw2.z + spot.dir[1]*(CELL/2 - 0.36));
    lgrp.rotation.y = Math.atan2(-spot.dir[0], -spot.dir[1]);
    lgrp.userData.bake = true;      // 置いたら動かない
    world.group.add(lgrp);
    world.props.push({ x:lgrp.position.x, z:lgrp.position.z, r:0.50, h:2.05 });  // ロッカーは視線を遮る
    world.hides.push({
      type:'locker', group:lgrp,
      x:lgrp.position.x, z:lgrp.position.z,          // 中に入ったときの視点
      exitX:sw2.x, exitZ:sw2.z,
      reach:2.30, outDist:1.85,
      camY:1.42, yaw:Math.atan2(-spot.dir[0], -spot.dir[1]) + Math.PI, span:1.15
    });
  }

  for(var bi=0; bi<world.rooms.length; bi++){
    var rm = world.rooms[bi];
    var bc = { x:rm.cx, y:rm.cy };
    var bkey = bc.x + ',' + bc.y;
    if(used[bkey]) continue;
    used[bkey] = true;
    var bw = cellToWorld(bc.x, bc.y);
    var bgrp = new THREE.Group();
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.12, 2.1), bedMat);
    frame.position.y = 0.62; bgrp.add(frame);
    var sheet = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.14, 1.95), sheetMat);
    sheet.position.y = 0.74; bgrp.add(sheet);
    // 枕。頭の側が分かると、ベッドが「向きのある物」になる
    var pillow = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.13, 0.34), sheetMat);
    pillow.position.set(0, 0.845, -0.72); bgrp.add(pillow);
    // 頭側と足側の柵。病棟のベッドには必ず付いている
    for(var hb=0; hb<2; hb++){
      var zz = hb ? 1.02 : -1.02, hh = hb ? 0.34 : 0.52;
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.05, 0.05), bedMat);
      rail.position.set(0, 0.68 + hh, zz); bgrp.add(rail);
      for(var pv=0; pv<2; pv++){
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.05, hh, 0.05), bedMat);
        post.position.set((pv?1:-1)*0.48, 0.68 + hh/2, zz); bgrp.add(post);
      }
    }
    for(var lgi=0; lgi<4; lgi++){
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.50, 0.07), bedMat);
      leg.position.set((lgi%2?1:-1)*0.46, 0.31, (lgi<2?1:-1)*0.95);
      bgrp.add(leg);
      // キャスター
      var cast = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.11, 0.06), slatMat);
      cast.position.set((lgi%2?1:-1)*0.46, 0.055, (lgi<2?1:-1)*0.95);
      bgrp.add(cast);
    }
    bgrp.position.set(bw.x, 0, bw.z);
    var bedRot = (rnd() < 0.5) ? 0 : Math.PI/2;
    bgrp.rotation.y = bedRot;
    bgrp.userData.bake = true;
    world.group.add(bgrp);
    world.props.push({ x:bw.x, z:bw.z, r:0.62, h:0.81 });
    // 出るときは枕元ではなく脇に立たせる（什器に埋まらないように）
    var sideX = bw.x + (bedRot === 0 ? 1.15 : 0);
    var sideZ = bw.z + (bedRot === 0 ? 0 : 1.15);
    world.hides.push({
      type:'bed', group:bgrp,
      x:bw.x, z:bw.z, exitX:sideX, exitZ:sideZ,
      reach:2.00, outDist:1.35,
      camY:0.42, yaw:bedRot, span:Math.PI      // 下に潜ったら全方位を見回せる
    });
  }

  // --- 机：通路と部屋に置かれた什器。当たり判定あり ---
  var deskTop = new THREE.MeshStandardMaterial({ color:SRGB(0x6b5a44), roughness:0.8 });
  var deskLeg = new THREE.MeshStandardMaterial({ color:SRGB(0x3a3d3c), roughness:0.7, metalness:0.5 });
  for(var dk=0; dk<7; dk++){
    var dspot = wallCellNear();
    if(!dspot) break;
    var dw = cellToWorld(dspot.cell.x, dspot.cell.y);
    var dgrp = new THREE.Group();
    var top = new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 0.68), deskTop);
    top.position.y = 0.74; dgrp.add(top);
    var apron = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.18, 0.55), deskTop);
    apron.position.y = 0.62; dgrp.add(apron);
    /* 引き出しの箱。天板と脚だけだと「板を4本の棒で支えた物」にしか
       見えない。事務机の見た目を決めているのは、片側に寄った引き出しの
       塊と、その面に並ぶ取っ手。左右どちらに付くかは机ごとに変える
       （乱数は引かない。引くと同じ種でも間取りが変わる）。 */
    var dside = (dk % 2) ? 1 : -1;
    var ped = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.60, 0.60), deskTop);
    ped.position.set(dside*0.38, 0.40, 0); dgrp.add(ped);
    for(var dr=0; dr<3; dr++){
      var face = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.165, 0.02), deskLeg);
      face.position.set(dside*0.38, 0.19 + dr*0.195, 0.305); dgrp.add(face);
      var pull = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.028, 0.028), deskLeg);
      pull.position.set(dside*0.38, 0.19 + dr*0.195, 0.325); dgrp.add(pull);
    }
    // 反対側の脚と、背面の幕板
    for(var dl=0; dl<2; dl++){
      var lgm = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.72, 0.07), deskLeg);
      lgm.position.set(-dside*0.55, 0.36, (dl<1?1:-1)*0.27);
      dgrp.add(lgm);
    }
    var back = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.42, 0.03), deskTop);
    back.position.set(0, 0.40, -0.30); dgrp.add(back);
    if(rnd() < 0.6){
      var stack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.22),
        new THREE.MeshStandardMaterial({ color:0xd6d0be, roughness:0.9 }));
      stack.position.set(-0.25 + rnd()*0.5, 0.80, 0);
      stack.rotation.y = rnd()*0.6 - 0.3;
      dgrp.add(stack);
    }
    dgrp.position.set(dw.x + dspot.dir[0]*(CELL/2 - 0.5), 0, dw.z + dspot.dir[1]*(CELL/2 - 0.5));
    dgrp.rotation.y = Math.atan2(-dspot.dir[0], -dspot.dir[1]);
    dgrp.userData.bake = true;
    world.group.add(dgrp);
    world.props.push({ x:dgrp.position.x, z:dgrp.position.z, r:0.62, h:0.80 });
    world.hides.push({
      type:'desk', group:dgrp,
      x:dgrp.position.x, z:dgrp.position.z,
      exitX:dw.x, exitZ:dw.z,
      reach:2.00, outDist:1.35,
      camY:0.38, yaw:dgrp.rotation.y + Math.PI, span:Math.PI
    });
  }

  /* --- 非常灯（明かりはライトプールで最寄りだけ点灯） ---
     見た目が 0.9x0.28 の板 1 枚だった。天井に光る長方形が貼ってあるだけで、
     見上げても「照明器具」に見えない。実物は箱形の筐体に乳白の
     パネルが嵌まっている。筐体は 16 台ぶんを 1 つに結合するので
     ドローコールは増えない（明滅するパネルだけ台ごとに持つ）。 */
  var lampMatProto = new THREE.MeshBasicMaterial({ color:0xffb75a });
  var lampGeo = new THREE.PlaneGeometry(0.9, 0.28);
  var caseSpecs = [];
  var lampCells = [];
  for(var lr=0; lr<world.rooms.length; lr++)
    lampCells.push({ x:world.rooms[lr].cx, y:world.rooms[lr].cy });   // 部屋の中央を光らせて目印にする
  while(lampCells.length < 16) lampCells.push(reach[(rnd()*reach.length)|0]);

  for(var L=0;L<lampCells.length;L++){
    var cl = lampCells[L];
    if(!inBounds(cl.x,cl.y) || g[idx(cl.x,cl.y)] !== 0) cl = reach[(rnd()*reach.length)|0];
    var wl = cellToWorld(cl.x, cl.y);
    var lm = new THREE.Mesh(lampGeo, lampMatProto.clone());
    lm.position.set(wl.x, WALL_H-0.12, wl.z);
    lm.rotation.x = Math.PI/2;
    world.group.add(lm);
    /* 筐体。パネルより一回り大きい浅い箱と、長辺の 2 本のリブ。
       向きはマスの通路の向きに合わせず全台同じにする——天井の
       T バーの目地と平行になるので、揃っているほうが自然に見える。 */
    /* 箱の底はパネルより 1cm 上に置く。同じ高さにすると、下から見たとき
       箱の底面がパネルを塞いで、器具が消灯しているように見える。 */
    caseSpecs.push({ w:1.06, h:0.13, d:0.44, x:wl.x, y:WALL_H-0.045, z:wl.z, c:0x6d7268 });
    caseSpecs.push({ w:1.10, h:0.035, d:0.06, x:wl.x, y:WALL_H-0.118, z:wl.z-0.20, c:0x4a4f47 });
    caseSpecs.push({ w:1.10, h:0.035, d:0.06, x:wl.x, y:WALL_H-0.118, z:wl.z+0.20, c:0x4a4f47 });
    world.lamps.push({ x:wl.x, z:wl.z, mesh:lm, flick:rnd()*TAU, alive:true });
  }
  if(caseSpecs.length){
    var caseMesh = new THREE.Mesh(mergeTinted(caseSpecs), new THREE.MeshStandardMaterial({
      color:0xffffff, vertexColors:true, map:TEX.grunge || null,
      roughnessMap:TEX.grungeR || null, roughness:TEX.grungeR ? 1 : 0.68, metalness:0.32
    }));
    caseMesh.frustumCulled = false;
    world.group.add(caseMesh);
  }

  // --- 区画表示板 ---
  // 目的：地図を与えずに現在地を掴ませる。病棟を3x3に割り、各区画の壁に記号板を貼る。
  // カルテが揃うと、板の下の誘導灯が点いて非常口の方向を指すようになる。
  world.exitField = bfsField(g, far.x, far.y);
  var signGeo  = new THREE.PlaneGeometry(1.05, 0.52);
  var arrowGeo = new THREE.PlaneGeometry(0.40, 0.40);
  var zoneMats = [];
  var zoneBuckets = [];
  for(var zb=0; zb<9; zb++) zoneBuckets.push([]);
  for(var zr=0; zr<reach.length; zr++){
    var zc = reach[zr];
    if(zc.x === far.x && zc.y === far.y) continue;
    // 扉と同じく、板を貼れる壁に面したマスだけを候補にする
    for(var zd=0; zd<4; zd++){
      var znx = zc.x + EDIRS[zd][0], zny = zc.y + EDIRS[zd][1];
      if(inBounds(znx,zny) && g[idx(znx,zny)] === 1){
        zoneBuckets[zoneOf(zc.x, zc.y)].push({ cell:zc, dir:EDIRS[zd] });
        break;
      }
    }
  }
  for(var zn=0; zn<9; zn++){
    var bucket = zoneBuckets[zn];
    if(!bucket.length) continue;
    for(var bs2=bucket.length-1; bs2>0; bs2--){
      var bj=(rnd()*(bs2+1))|0, bt=bucket[bs2]; bucket[bs2]=bucket[bj]; bucket[bj]=bt;
    }
    var placed = [];
    var want = QC.signs;
    for(var bk=0; bk<bucket.length && placed.length<want; bk++){
      var sp2 = bucket[bk];
      // 同じ区画の板どうしが固まらないよう間隔をあける
      var farEnough = true;
      for(var pz=0; pz<placed.length; pz++){
        if(Math.abs(placed[pz].x - sp2.cell.x) + Math.abs(placed[pz].y - sp2.cell.y) < 5){ farEnough = false; break; }
      }
      if(!farEnough) continue;
      placed.push(sp2.cell);

      var zw = cellToWorld(sp2.cell.x, sp2.cell.y);
      var zgrp = new THREE.Group();
      // 板のマテリアルは区画ごとに1つ使い回す。板は明滅も色替えもしないので
      // 共有して構わず、同じマテリアルになることでバッチ結合の対象にもなる
      if(!zoneMats[zn]) zoneMats[zn] = new THREE.MeshBasicMaterial({ map:TEX.zone[zn] });
      var plate = new THREE.Mesh(signGeo, zoneMats[zn]);
      plate.position.y = 2.28;
      zgrp.add(plate);

      // 誘導灯（消灯状態で置いておく）。方向は出口からのBFS勾配を下る向き
      var arrowMat = new THREE.MeshBasicMaterial({
        map:TEX.arrow, transparent:true, color:0x6fbfa8, opacity:0, depthWrite:false
      });
      var arrow = new THREE.Mesh(arrowGeo, arrowMat);
      arrow.position.y = 1.74;
      // 板の面内で矢印を回す。出口へ近づく隣接マスを探す
      var hereD = world.exitField[idx(sp2.cell.x, sp2.cell.y)];
      var stepDir = null;
      if(hereD > 0){
        for(var ad=0; ad<4; ad++){
          var anx = sp2.cell.x + EDIRS[ad][0], any2 = sp2.cell.y + EDIRS[ad][1];
          if(!inBounds(anx,any2) || g[idx(anx,any2)] !== 0) continue;
          if(world.exitField[idx(anx,any2)] === hereD - 1){ stepDir = EDIRS[ad]; break; }
        }
      }
      var faceYaw = Math.atan2(-sp2.dir[0], -sp2.dir[1]);   // 板の正面が向く方位（通路側）
      // 矢印は板の面内にしか向けられないので、進行方向を面内へ射影する。
      // 板をY軸に faceYaw だけ回すと、板のローカル+X軸は世界の (-dz, dx) を向く。
      // 面の法線（通路側）は (-dx, -dz)。
      var wdx = sp2.dir[0], wdz = sp2.dir[1];
      if(stepDir){
        var along  =  -stepDir[0]*wdz + stepDir[1]*wdx;   // 板に沿う成分（右が正）
        var toward =  -stepDir[0]*wdx - stepDir[1]*wdz;   // 板から手前へ出る成分
        // 手前向き＝プレイヤーの背後なので、下向きの矢印にする（実際の誘導表示と同じ作法）
        arrow.rotation.z = Math.atan2(-toward, along);
      }else{
        arrow.rotation.z = 0;
      }
      arrow.visible = false;
      zgrp.add(arrow);

      zgrp.position.set(
        zw.x + sp2.dir[0]*(CELL/2 - 0.06), 0,
        zw.z + sp2.dir[1]*(CELL/2 - 0.06)
      );
      zgrp.rotation.y = faceYaw;
      zgrp.userData.bake = true;
      arrow.userData.noBake = true;   // 明滅・向き替えするので焼かない
      world.group.add(zgrp);
      world.zones.push({ group:zgrp, arrow:arrow, mat:arrowMat, x:zgrp.position.x, z:zgrp.position.z, lit:0 });
    }
  }

  /* --- 病棟の什器 ---------------------------------------------------------
     机とロッカーとドラム缶しか無かったので、どの廊下も同じ顔をしていた。
     病院にあるものを 3 種類足す。どれも箱と円筒の組み合わせで、
     形の輪郭だけで何か分かるように寸法を実物に寄せてある。
     視線は遮らない高さ（1.05）にしてある——細い支柱や車椅子の向こうが
     見えないのは不自然だし、隠れ場所として機能してしまう。 */
  var GT = TEX.grunge || null, GR = TEX.grungeR || null;
  var mtlSteel = new THREE.MeshStandardMaterial({ color:0x9aa3a1, map:GT, roughnessMap:GR,
                                                  roughness:GR?1:0.42, metalness:0.72 });
  var mtlPaint = new THREE.MeshStandardMaterial({ color:0x5c6b68, map:GT, roughnessMap:GR,
                                                  roughness:GR?1:0.72, metalness:0.18 });
  var mtlSheet = new THREE.MeshStandardMaterial({ color:0xc8c6b6, map:GT, roughnessMap:GR,
                                                  roughness:GR?1:0.94 });
  var mtlBag   = new THREE.MeshStandardMaterial({ color:0xd7e2cf, roughness:0.35,
                                                  transparent:true, opacity:0.72 });
  var mtlTire  = new THREE.MeshStandardMaterial({ color:0x24282a, roughness:0.95 });

  // 点滴スタンド：細い支柱、五本脚、袋がひとつ下がっている
  var ivN = Math.max(2, Math.round(QC.props / 9));
  for(var iv=0; iv<ivN; iv++){
    var isp = wallCellNear();
    if(!isp) break;
    var iw = cellToWorld(isp.cell.x, isp.cell.y);
    var ig = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.72, 6), mtlSteel);
    pole.position.y = 0.86; ig.add(pole);
    var hook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 4, 8), mtlSteel);
    hook.position.y = 1.70; hook.rotation.x = Math.PI/2; ig.add(hook);
    for(var il=0; il<5; il++){
      var la = il/5*TAU;
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.26), mtlSteel);
      leg.position.set(Math.cos(la)*0.13, 0.03, Math.sin(la)*0.13);
      leg.rotation.y = -la; ig.add(leg);
    }
    if(rnd() < 0.75){
      var bag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.05), mtlBag);
      bag.position.set(0.055, 1.52, 0); bag.rotation.z = -0.06; ig.add(bag);
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.52, 4), mtlBag);
      tube.position.set(0.075, 1.16, 0.01); tube.rotation.z = 0.16; ig.add(tube);
    }
    ig.position.set(iw.x + isp.dir[0]*(CELL/2 - 0.42) + (rnd()-0.5)*0.3, 0,
                    iw.z + isp.dir[1]*(CELL/2 - 0.42) + (rnd()-0.5)*0.3);
    ig.rotation.y = rnd()*TAU;
    ig.userData.bake = true;
    world.group.add(ig);
    world.props.push({ x:ig.position.x, z:ig.position.z, r:0.22, h:1.05 });
  }

  // ストレッチャー：寝台。廊下に斜めに置き去りにされている
  var gyN = Math.max(1, Math.round(QC.props / 14));
  for(var gy=0; gy<gyN; gy++){
    var gsp = wallCellNear();
    if(!gsp) break;
    var gw = cellToWorld(gsp.cell.x, gsp.cell.y);
    var gg = new THREE.Group();
    var pad = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.10, 0.66), mtlSheet);
    pad.position.y = 0.74; gg.add(pad);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.06, 0.72), mtlPaint);
    frame.position.y = 0.66; gg.add(frame);
    for(var gr=0; gr<2; gr++){            // 側面の柵。片方だけ下ろしてある
      if(gr === 1 && rnd() < 0.5) continue;
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.026, 0.026), mtlSteel);
      rail.position.set(0, 0.98, (gr ? 1 : -1) * 0.34); gg.add(rail);
      for(var rp=0; rp<2; rp++){
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.30, 0.026), mtlSteel);
        post.position.set((rp ? 1 : -1) * 0.52, 0.84, (gr ? 1 : -1) * 0.34); gg.add(post);
      }
    }
    for(var gl=0; gl<4; gl++){
      var gleg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 5), mtlSteel);
      gleg.position.set((gl%2?1:-1)*0.78, 0.34, (gl<2?1:-1)*0.28); gg.add(gleg);
      var cast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 8), mtlTire);
      cast.rotation.z = Math.PI/2;
      cast.position.set((gl%2?1:-1)*0.78, 0.065, (gl<2?1:-1)*0.28); gg.add(cast);
    }
    gg.position.set(gw.x + (rnd()-0.5)*0.5, 0, gw.z + (rnd()-0.5)*0.5);
    gg.rotation.y = Math.atan2(-gsp.dir[0], -gsp.dir[1]) + (rnd()-0.5)*0.7;
    gg.userData.bake = true;
    world.group.add(gg);
    world.props.push({ x:gg.position.x, z:gg.position.z, r:0.72, h:1.05 });
  }

  // 車椅子：壁を向いて置かれている
  var wcN = Math.max(1, Math.round(QC.props / 16));
  for(var wc2=0; wc2<wcN; wc2++){
    var wsp = wallCellNear();
    if(!wsp) break;
    var ww = cellToWorld(wsp.cell.x, wsp.cell.y);
    var wg = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), mtlPaint);
    seat.position.y = 0.50; wg.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.05), mtlPaint);
    back.position.set(0, 0.76, -0.21); back.rotation.x = -0.10; wg.add(back);
    for(var wh=0; wh<2; wh++){
      var big = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 4, 14), mtlTire);
      big.position.set((wh?1:-1)*0.28, 0.30, -0.02); big.rotation.y = Math.PI/2; wg.add(big);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 4, 12), mtlSteel);
      rim.position.copy(big.position); rim.rotation.y = Math.PI/2; wg.add(rim);
      var small = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.018, 4, 10), mtlTire);
      small.position.set((wh?1:-1)*0.20, 0.10, 0.32); small.rotation.y = Math.PI/2; wg.add(small);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.40), mtlSteel);
      arm.position.set((wh?1:-1)*0.25, 0.70, 0.02); wg.add(arm);
    }
    wg.position.set(ww.x + wsp.dir[0]*(CELL/2 - 0.55), 0, ww.z + wsp.dir[1]*(CELL/2 - 0.55));
    wg.rotation.y = Math.atan2(-wsp.dir[0], -wsp.dir[1]) + Math.PI + (rnd()-0.5)*0.5;
    wg.userData.bake = true;
    world.group.add(wg);
    world.props.push({ x:wg.position.x, z:wg.position.z, r:0.42, h:1.05 });
  }

  /* --- 通路に転がっている物 ---
     ドラム缶 1 種類しか置いていなかったので、どの廊下も同じ樽が
     並んでいるだけだった。病棟なのに病棟の物が何も無い。
     3 種類に増やす。

     大事な制約が 2 つある。
       ・当たり判定は全種で同じ（半径0.55・高さ1.05）にする。見た目だけの
         変更に留めれば、経路探索も遮蔽もこれまでと 1 ビットも変わらない。
       ・種類を選ぶのに rnd() を引かない。乱数の流れが 1 回でもずれると
         間取りごと変わって、これまでの回帰結果と比べられなくなる。
         マスの座標から決める。 */
  var PROP_KINDS = [
    // 0: 廃液のドラム缶
    mergeTinted([
      { type:'cyl', r:0.44, rb:0.46, h:1.05, c:0x4a3f33 },
      { type:'cyl', r:0.475, h:0.055, y:0.30,  c:0x3a3128 },   // 補強のリブ
      { type:'cyl', r:0.475, h:0.055, y:-0.28, c:0x3a3128 },
      { type:'cyl', r:0.36,  h:0.035, y:0.53,  c:0x59503f },   // 天板
      { type:'cyl', r:0.085, h:0.045, y:0.56, x:0.20, c:0x6d6252 } // 注ぎ口
    ]),
    // 1: 積み上げた薬品ケース
    mergeTinted([
      { w:0.78, h:0.36, d:0.60, y:-0.34, c:0x4d5147 },
      { w:0.74, h:0.030,d:0.56, y:-0.15, c:0x5d6156 },
      { w:0.70, h:0.34, d:0.54, y:0.02, ry:0.22, c:0x565a4c },
      { w:0.66, h:0.030,d:0.50, y:0.20, ry:0.22, c:0x666a5a },
      { w:0.54, h:0.28, d:0.44, y:0.36, ry:-0.15, c:0x4a4e42 },
      { w:0.20, h:0.012,d:0.15, y:0.501,ry:-0.15, c:0xa8a292 }  // 貼り紙
    ]),
    // 2: 洗濯物のかご（キャスター付き）
    mergeTinted([
      { w:0.86, h:0.055, d:0.62, y:-0.42, c:0x3d4046 },          // 台
      { type:'cyl', ax:'x', r:0.055, h:0.70, y:-0.50, z:0.22, c:0x24262a },
      { type:'cyl', ax:'x', r:0.055, h:0.70, y:-0.50, z:-0.22, c:0x24262a },
      { w:0.84, h:0.52, d:0.60, y:-0.10, c:0x6d6a5c },           // かご
      { w:0.88, h:0.045,d:0.64, y:0.17,  c:0x50524a },           // 縁
      { w:0.72, h:0.22, d:0.48, y:0.28,  ry:0.18, c:0xbdb7a4 }   // はみ出た布
    ])
  ];
  /* metalness 0.22 ＋ roughness 0.82 だと、鏡面反射の下駄（F0≒0.095）が
     暗い色の拡散反射（0.06 程度）を上回って、何色を入れても白い塊に
     なっていた。地色を赤にしたときだけ赤く出たのがその証拠。
     塗装された金属は「広く鈍く光る」のではなく「狭く強く光る」。 */
  var propMat = new THREE.MeshStandardMaterial({
    color:0xffffff, vertexColors:true, map:TEX.grunge || null,
    roughnessMap:TEX.grungeR || null,
    roughness:TEX.grungeR ? 1 : 0.66, metalness:0.05
  });
  var pn = QC.props;
  var propMesh = [], propN = [0,0,0];
  for(var pk2=0; pk2<3; pk2++){
    var im = new THREE.InstancedMesh(PROP_KINDS[pk2], propMat, pn);
    im.frustumCulled = false;
    im.castShadow = !!QC.shadows;
    im.receiveShadow = !!QC.shadows;
    propMesh.push(im);
  }
  var dummy = new THREE.Object3D();   // 壁を結合ジオメトリにしたので、置き場をここへ移す
  var pi = 0;
  for(var p=0;p<pn;p++){
    var cp = reach[(rnd()*reach.length)|0];
    if(cp.x===startC.x && cp.y===startC.y) continue;
    var wp = cellToWorld(cp.x, cp.y);
    var ox = (rnd()-0.5)*CELL*0.4, oz = (rnd()-0.5)*CELL*0.4;
    dummy.position.set(wp.x+ox, 0.52, wp.z+oz);
    dummy.rotation.set(0, rnd()*TAU, 0);
    dummy.scale.set(1,1,1);
    dummy.updateMatrix();
    var kind = (cp.x*7 + cp.y*13 + p*5) % 3;      // 乱数を消費しない選び方
    propMesh[kind].setMatrixAt(propN[kind]++, dummy.matrix);
    pi++;
    world.props.push({ x:wp.x+ox, z:wp.z+oz, r:0.55, h:1.05 });
  }
  for(var pk3=0; pk3<3; pk3++){
    propMesh[pk3].count = propN[pk3];
    propMesh[pk3].instanceMatrix.needsUpdate = true;
    if(propN[pk3]) world.group.add(propMesh[pk3]);
  }
  world.propKinds = propN;

  /* --- 什器の接地影 ---
     懐中電灯は頭に付いているので、光軸と視線がほぼ一致する。その配置では
     物の影は必ずその物自身の裏に隠れ、こちらからは見えない
     （影の計算自体は動いていて、追跡者の後ろの壁には出ている）。
     結果、床に置いた箱もドラム缶も接地の手がかりが無く、貼り付けたように
     浮いて見えていた。真上から見た遮蔽を 1 枚の板で置く。
     全部まとめて 1 つのメッシュにするのでドローコールは 1 つ。 */
  if(TEX.shadow && world.props.length){
    var bp = [], bu = [], bi = [], bn = 0;
    for(var bs=0; bs<world.props.length; bs++){
      var op2 = world.props[bs];
      // 背の高い物ほど影を広く薄く。実際の面光源の下ではそうなる
      var br = op2.r * (1.5 + Math.min(op2.h, 2.1)*0.22);
      var b0 = bn*4;
      var bq = [[-1,-1],[1,-1],[1,1],[-1,1]];
      for(var bk=0; bk<4; bk++){
        bp.push(op2.x + bq[bk][0]*br, 0.018, op2.z + bq[bk][1]*br);
        bu.push((bq[bk][0]+1)*0.5, (bq[bk][1]+1)*0.5);
      }
      bi.push(b0, b0+2, b0+1, b0, b0+3, b0+2);
      bn++;
    }
    var bg2 = new THREE.BufferGeometry();
    bg2.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    bg2.setAttribute('uv',       new THREE.Float32BufferAttribute(bu, 2));
    bg2.setIndex(bi);
    bg2.computeVertexNormals(); fixNormals(bg2);
    /* 乗算合成にすると、透明な縁まで黒を掛けてしまって板の四角が出る
       （TEX.shadow は「黒の不透明度」で描いてあるので、色ではなく
       alpha で効かせるのが正しい）。追跡者の影と同じ通常合成にする。 */
    var blobMesh = new THREE.Mesh(bg2, new THREE.MeshBasicMaterial({
      map:TEX.shadow, transparent:true, depthWrite:false, opacity:0.85
    }));
    blobMesh.frustumCulled = false;
    blobMesh.renderOrder = 2;
    world.group.add(blobMesh);
    world.propShadows = bn;
  }

  // 章ごとの「顔」になる部屋（第 6.1 節）。中央の大広間を作り込む。経路の格子より先に置く
  heroRoom(g, bigHall);

  // 什器を織り込んだ、追跡者の経路探索専用グリッドを作る
  world.nav = buildNavGrid(g, startC);

  placeBottles(pool, used, startC);
  placeBandages(pool, used, startC);

  bakeStaticFurniture();

  return { start:startC, field:field, reach:reach };
}

/* ---- 静的什器のバッチ結合 ----
   ロッカー・ベッド・机・区画表示板は置いたあと一切動かない。個別メッシュのまま
   だと 180 個ぶんのドローコールになり、什器の多い部屋でフレームが跳ねる。
   同じマテリアルのジオメトリを1つに焼き固めてドローコールを畳む。

   全部を1メッシュにまとめないのは、そうすると視錐台カリングが効かなくなり、
   壁の裏の什器まで毎フレーム描くことになるため。区画表示板と同じ 3x3 の
   区画で割り、区画ごとに固めることで、カリングの効きを保ったまま数を減らす。 */
function mergeMeshes(list, parentInv){
  // 使っているのは Box / Plane / Cylinder だけで、いずれも
  // position・normal・uv の3属性を持つ。連結もこの3つに絞る
  var vtot = 0, itot = 0, i, gs;
  for(i=0;i<list.length;i++){
    gs = list[i].geometry;
    vtot += gs.attributes.position.count;
    itot += gs.index ? gs.index.count : gs.attributes.position.count;
  }
  var pos = new Float32Array(vtot*3), nrm = new Float32Array(vtot*3), uvs = new Float32Array(vtot*2);
  var ind = (vtot > 65535) ? new Uint32Array(itot) : new Uint16Array(itot);
  var m4 = new THREE.Matrix4(), m3 = new THREE.Matrix3(), v = new THREE.Vector3();
  var vo = 0, io = 0;
  for(i=0;i<list.length;i++){
    var msh = list[i];
    gs = msh.geometry;
    m4.multiplyMatrices(parentInv, msh.matrixWorld);   // 親の変換を打ち消して world.group ローカルへ
    m3.getNormalMatrix(m4);
    var pa = gs.attributes.position, na = gs.attributes.normal, ua = gs.attributes.uv;
    var cnt = pa.count, k;
    for(k=0;k<cnt;k++){
      v.set(pa.getX(k), pa.getY(k), pa.getZ(k)).applyMatrix4(m4);
      pos[(vo+k)*3] = v.x; pos[(vo+k)*3+1] = v.y; pos[(vo+k)*3+2] = v.z;
      if(na){
        v.set(na.getX(k), na.getY(k), na.getZ(k)).applyMatrix3(m3).normalize();
        nrm[(vo+k)*3] = v.x; nrm[(vo+k)*3+1] = v.y; nrm[(vo+k)*3+2] = v.z;
      }
      if(ua){ uvs[(vo+k)*2] = ua.getX(k); uvs[(vo+k)*2+1] = ua.getY(k); }
    }
    if(gs.index){
      var ia = gs.index;
      for(k=0;k<ia.count;k++) ind[io+k] = vo + ia.getX(k);
      io += ia.count;
    }else{
      for(k=0;k<cnt;k++) ind[io+k] = vo + k;
      io += cnt;
    }
    vo += cnt;
  }
  var out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal',   new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv',       new THREE.BufferAttribute(uvs, 2));
  out.setIndex(new THREE.BufferAttribute(ind, 1));
  out.computeBoundingSphere();
  return out;
}

function bakeStaticFurniture(){
  world.group.updateMatrixWorld(true);
  var parentInv = new THREE.Matrix4().copy(world.group.matrixWorld).invert();
  var buckets = {}, order = [];
  var targets = [];

  // 印はグループ側に付ける。動くもの（誘導矢印など）だけ noBake で除外する
  world.group.traverse(function(o){
    if(!o.isMesh || o.isInstancedMesh) return;
    if(o.userData && o.userData.noBake) return;
    var bakeable = false;
    for(var p=o; p; p=p.parent){
      if(p.userData && p.userData.bake){ bakeable = true; break; }
      if(p === world.group) break;
    }
    if(bakeable) targets.push(o);
  });

  for(var i=0;i<targets.length;i++){
    var o = targets[i];
    var e = o.matrixWorld.elements;
    var c = worldToCell(e[12], e[14]);
    var key = zoneOf(clamp(c.x,0,GW-1), clamp(c.y,0,GH-1)) + '|' + o.material.uuid;
    if(!buckets[key]){ buckets[key] = { mat:o.material, list:[] }; order.push(key); }
    buckets[key].list.push(o);
  }

  var baked = 0;
  for(var b=0;b<order.length;b++){
    var bk = buckets[order[b]];
    if(bk.list.length < 2) continue;            // 1個だけなら畳む意味がない
    var geo = mergeMeshes(bk.list, parentInv);
    var mesh = new THREE.Mesh(geo, bk.mat);
    mesh.castShadow = bk.list[0].castShadow;
    mesh.receiveShadow = bk.list[0].receiveShadow;
    world.group.add(mesh);
    for(var r=0;r<bk.list.length;r++){
      var src = bk.list[r];
      if(src.parent) src.parent.remove(src);
      src.geometry.dispose();
    }
    baked += bk.list.length;
  }

  // 中身が空になったグループは残しても走査コストになるだけなので外す。
  // ただし当たり判定やインタラクトが参照しているグループもあるので、
  // 位置情報だけの空グループとして残す（remove すると座標が失われる）
  world.bakeInfo = { meshesBefore:targets.length, batches:order.length, baked:baked };
}

// 追跡者は world.grid だけを見て経路を引いていたため、
// 机・ドラム缶・ロッカーで塞がったマスへ平気で突っ込み、
// そこで押し戻され続けて動けなくなっていた。
// 通り抜けられる幅が残っているかを実測して、塞がったマスを壁として扱う。
function buildNavGrid(g, seedCell){
  var R = 0.40;                     // 追跡者の当たり半径 0.34 に余裕を持たせる
  var nav = new Uint8Array(g.length);
  nav.set(g);
  var half = CELL/2, blocked = [];

  function standable(cx, cy){
    var w = cellToWorld(cx, cy);
    // マス内を格子状に試し、体が収まる場所が一つでもあれば通れる
    for(var sy=-2; sy<=2; sy++){
      for(var sx=-2; sx<=2; sx++){
        var px = w.x + sx*(half - R)/2;
        var pz = w.z + sy*(half - R)/2;
        var ok = true;
        for(var i=0;i<world.props.length;i++){
          var o = world.props[i];
          var dx = px - o.x, dz = pz - o.z, rr = o.r + R;
          if(dx*dx + dz*dz < rr*rr){ ok = false; break; }
        }
        if(ok) return true;
      }
    }
    return false;
  }

  // 什器の無いマスは判定するだけ無駄なので、什器の周り1マスだけを調べる
  var candidate = {};
  for(var pi2=0; pi2<world.props.length; pi2++){
    var pc = worldToCell(world.props[pi2].x, world.props[pi2].z);
    for(var cy=-1; cy<=1; cy++) for(var cx=-1; cx<=1; cx++){
      var qx2 = pc.x+cx, qy2 = pc.y+cy;
      if(inBounds(qx2,qy2) && g[idx(qx2,qy2)] === 0) candidate[qx2+','+qy2] = {x:qx2, y:qy2};
    }
  }
  for(var ck in candidate){
    if(!candidate.hasOwnProperty(ck)) continue;
    var cc2 = candidate[ck];
    if(!standable(cc2.x, cc2.y)){ nav[idx(cc2.x,cc2.y)] = 1; blocked.push(cc2); }
  }

  // 塞いだ結果、行けない場所を作ってしまっては本末転倒（プレイヤーが
  // そこへ逃げ込むと永久に安全になる）。孤立が消えるまで塞ぎを戻す。
  var openCount = 0;
  for(var oi=0; oi<g.length; oi++) if(g[oi] === 0) openCount++;
  var guard = 0;
  while(blocked.length && guard++ < 400){
    var f = bfsField(nav, seedCell.x, seedCell.y);
    var reachN = 0;
    for(var ri=0; ri<f.length; ri++) if(f[ri] >= 0) reachN++;
    if(reachN + blocked.length >= openCount &&
       reachN === openCount - blocked.length) break;   // 塞いだぶんだけが減っている＝孤立なし
    // 到達できない元通路に隣接している塞ぎマスを開け直す
    var restored = false;
    for(var bi2=0; bi2<blocked.length; bi2++){
      var b = blocked[bi2], touchesDead = false;
      for(var di=0; di<4; di++){
        var nx2 = b.x + (di===0?1:di===1?-1:0), ny2 = b.y + (di===2?1:di===3?-1:0);
        if(!inBounds(nx2,ny2)) continue;
        if(g[idx(nx2,ny2)] === 0 && f[idx(nx2,ny2)] < 0) touchesDead = true;
      }
      if(touchesDead){
        nav[idx(b.x,b.y)] = 0;
        blocked.splice(bi2,1);
        restored = true;
        break;
      }
    }
    if(!restored){ for(var bj=0; bj<blocked.length; bj++) nav[idx(blocked[bj].x, blocked[bj].y)] = 0; blocked.length = 0; }
  }
  return nav;
}


/* --- 投げる瓶（設計指示書 第 5.2 節） ------------------------------------
   割れる音で追跡者を呼び寄せ、その間に別の道を行く。
   置き場所はゲームの乱数（rnd）を引かずに決める。引くと同じ種でも
   間取りの後に続く全部（追跡者の徘徊など）がずれ、これまでの測定と
   比べられなくなる。間取りそのものから種を作って別の乱数で引く。 */
var BOTTLES_PER_RUN = [4, 3, 3];
var bottleGeo = null;
function placeBottles(pool, used, startC){
  if(!bottleGeo){
    bottleGeo = mergeTinted([
      { type:'cyl', r:0.050, h:0.170, y:0,     c:0x2f4a3a },   // 胴（緑の硝子）
      { type:'cyl', r:0.020, h:0.070, y:0.118, c:0x2f4a3a },   // 首
      { type:'cyl', r:0.024, h:0.012, y:0.157, c:0x9a927e },   // 口
      { type:'cyl', r:0.051, h:0.060, y:-0.020, c:0xb9ab88 }   // 剥げかけたラベル
    ]);
  }
  var h = (pool.length * 2654435761 ^ (startC.x * 7919) ^ (startC.y * 104729)) >>> 0;
  var br = mulberry32(h || 1);
  var free = pool.filter(function(c){ return !used[c.x + ',' + c.y] &&
    (!world.nav || world.nav[idx(c.x, c.y)] === 0); });
  var n = BOTTLES_PER_RUN[clamp(settings.diff|0, 0, 2)];
  for(var i=0; i<n && free.length; i++){
    var k = (br() * free.length) | 0;
    var c = free.splice(k, 1)[0];
    var w = cellToWorld(c.x, c.y);
    var ox = (br() - 0.5) * 1.2, oz = (br() - 0.5) * 1.2;
    var mat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:0.18, metalness:0.1,
      emissive:0x6fbfa8, emissiveIntensity:0.05 });
    var m = new THREE.Mesh(bottleGeo, mat);
    m.position.set(w.x + ox, 0.10, w.z + oz);
    m.rotation.z = (br() < 0.5) ? Math.PI/2 : 0;           // 倒れているものもある
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glowW, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.22
    }));
    spr.scale.set(1.0, 1.0, 1); spr.position.copy(m.position);
    world.group.add(m); world.group.add(spr);
    world.bottles.push({ mesh:m, spr:spr, x:m.position.x, z:m.position.z, taken:false });
  }
}

/* --- 包帯（第 5.5 節）。拾うと振りほどける回数が 1 回戻る。
   瓶と同じく、ゲームの乱数を引かずに置く（間取りと展開を変えない） */
var bandageGeo = null;
function placeBandages(pool, used, startC){
  if(!bandageGeo){
    bandageGeo = mergeTinted([
      { type:'cyl', r:0.070, h:0.090, y:0,     c:0xd9d2bf },   // 巻いた包帯
      { type:'cyl', r:0.030, h:0.092, y:0,     c:0x8f8878 },   // 芯
      { w:0.16, h:0.004, d:0.05, y:0.047,       c:0x8c2626 }    // 赤い留め紙
    ]);
  }
  var h = (pool.length * 40503 ^ (startC.x * 65537) ^ (startC.y * 257)) >>> 0;
  var br = mulberry32(h || 7);
  var taken = {};
  world.bottles.forEach(function(b){ var c = worldToCell(b.x, b.z); taken[c.x + ',' + c.y] = 1; });
  var free = pool.filter(function(c){ var k = c.x + ',' + c.y;
    return !used[k] && !taken[k] && (!world.nav || world.nav[idx(c.x, c.y)] === 0); });
  var n = BANDAGES_PER_RUN[clamp(settings.diff|0, 0, 2)];
  for(var i=0; i<n && free.length; i++){
    var c = free.splice((br() * free.length) | 0, 1)[0];
    var w = cellToWorld(c.x, c.y);
    var mat = new THREE.MeshLambertMaterial({ color:0xffffff, vertexColors:true, emissive:0x8c2626, emissiveIntensity:0.06 });
    var m = new THREE.Mesh(bandageGeo, mat);
    m.position.set(w.x + (br()-0.5)*1.0, 0.05, w.z + (br()-0.5)*1.0);
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: TEX.glowW, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false, opacity:0.25
    }));
    spr.scale.set(1.0, 1.0, 1); spr.position.copy(m.position);
    world.group.add(m); world.group.add(spr);
    world.bandages.push({ mesh:m, spr:spr, x:m.position.x, z:m.position.z, taken:false });
  }
}

/* --- 水（設計指示書 第 5.4 節・第6章） ------------------------------------
   9 区画のうち 4 つが膝まで水に浸かっている。水の中では
     こちら … 遅くなり、足音が水しぶきになって遠くまで届く（忍び足なら抑えられる）
     あれ   … 足音が水音に紛れて聞こえにくくなる
   区画の選び方は間取りから作った乱数で決める（ゲームの rnd は引かない）。 */
var WATER_Y = 0.16;
var waterMesh = null;
function clearWater(){
  if(waterMesh){
    if(waterMesh.parent) waterMesh.parent.remove(waterMesh);
    var k = ENV_MATS.indexOf(waterMesh.material); if(k >= 0) ENV_MATS.splice(k, 1);   // 映り込みの登録も外す
    waterMesh.geometry.dispose(); waterMesh.material.dispose(); waterMesh = null;
  }
  world.water = null;
}
function buildWater(info, on){
  clearWater();
  if(!on) return;
  var g = world.grid;
  var br = mulberry32(((info.reach.length * 1597334677) ^ (info.start.x * 3812015801) ^ (info.start.y * 71)) >>> 0 || 9);
  var zs = [0,1,2,3,4,5,6,7,8];
  for(var i=zs.length-1; i>0; i--){ var j = (br() * (i+1)) | 0; var t = zs[i]; zs[i] = zs[j]; zs[j] = t; }
  var wet = {}; zs.slice(0, 4).forEach(function(z){ wet[z] = 1; });
  world.water = new Uint8Array(GW*GH);
  var pos = [], nor = [], uv = [], idxs = [], n = 0, h = CELL * 0.5;
  for(var y=0; y<GH; y++) for(var x=0; x<GW; x++){
    if(g[idx(x, y)] !== 0 || !wet[zoneOf(x, y)]) continue;
    world.water[idx(x, y)] = 1;
    var w = cellToWorld(x, y);
    pos.push(w.x-h, WATER_Y, w.z-h,  w.x+h, WATER_Y, w.z-h,  w.x+h, WATER_Y, w.z+h,  w.x-h, WATER_Y, w.z+h);
    nor.push(0,1,0, 0,1,0, 0,1,0, 0,1,0);
    var u0 = (w.x - h) / 3, u1 = (w.x + h) / 3, v0 = (w.z - h) / 3, v1 = (w.z + h) / 3;
    uv.push(u0, v0,  u1, v0,  u1, v1,  u0, v1);
    idxs.push(n, n+2, n+1, n, n+3, n+2); n += 4;
  }
  if(!n) return;
  var geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idxs);
  /* 黒く澄んだ水。粗さを低くしてランプの光を細く返す。
     底の床が透けて見えるよう少しだけ透かす（まるで床が消えたように見えると怖いより先に分かりにくい） */
  /* 最初は明るい青緑の板にしか見えなかった（拡散反射が強すぎ、床のタイルの
     ように光を受けていた）。色を沈め、映り込みとさざ波の法線で「光を返す面」にする。
     さざ波はゆっくり流して、止まった水ではないことを見せる（updateWater）。 */
  var mat = regEnvMat(new THREE.MeshStandardMaterial({ color:0x03080a, roughness:0.035, metalness:0.25,
    transparent:true, opacity:0.86, depthWrite:false, envMapIntensity:1.1,
    normalMap:waterNormals(), normalScale:new THREE.Vector2(0.35, 0.35) }));
  waterMesh = new THREE.Mesh(geo, mat);
  waterMesh.renderOrder = 3;
  world.group.add(waterMesh);
}
function inWater(x, z){
  if(!world.water) return false;
  var c = worldToCell(x, z);
  return inBounds(c.x, c.y) && world.water[idx(c.x, c.y)] === 1;
}

/* さざ波の法線マップ。いくつかの波を重ねた高さから法線を起こす（画像ファイルは使わない） */
var waterNTex = null;
function waterNormals(){
  if(waterNTex) return waterNTex;
  var S = 128, c = makeCanvas(S), x = c.getContext('2d'), im = x.createImageData(S, S), H = new Float32Array(S*S);
  var waves = [[3,1,0.5],[1,4,1.7],[5,-2,2.9],[-2,5,4.1],[7,3,0.3]];
  for(var j=0; j<S; j++) for(var i=0; i<S; i++){
    var h = 0;
    waves.forEach(function(w){ h += Math.sin((i*w[0] + j*w[1]) * TAU / S + w[2]) / (1 + Math.abs(w[0]) + Math.abs(w[1])); });
    H[j*S+i] = h;
  }
  for(var j2=0; j2<S; j2++) for(var i2=0; i2<S; i2++){
    var dx = H[j2*S + ((i2+1)%S)] - H[j2*S + ((i2+S-1)%S)];
    var dy = H[((j2+1)%S)*S + i2] - H[((j2+S-1)%S)*S + i2];
    var nx = -dx*2.2, ny = -dy*2.2, nz = 1, l = Math.sqrt(nx*nx + ny*ny + nz*nz), o = (j2*S+i2)*4;
    im.data[o] = (nx/l*0.5+0.5)*255; im.data[o+1] = (ny/l*0.5+0.5)*255; im.data[o+2] = (nz/l*0.5+0.5)*255; im.data[o+3] = 255;
  }
  x.putImageData(im, 0, 0);
  waterNTex = new THREE.CanvasTexture(c);
  waterNTex.wrapS = waterNTex.wrapT = THREE.RepeatWrapping;
  return waterNTex;
}
function updateWater(dt){
  if(!waterMesh || !waterNTex) return;
  waterNTex.offset.x = (waterNTex.offset.x + dt*0.012) % 1;
  waterNTex.offset.y = (waterNTex.offset.y + dt*0.007) % 1;
}

/* --- 章の顔になる部屋（設計指示書 第 6.1 節） -----------------------------
   病棟はどの章も手続き生成で、記憶に残る「場所」が無かった。中央の大広間
   （7×5 マス）を、章ごとに決まった部屋として作り込む：
     1 ナースステーション  2 大部屋  3 配電室  4 階段  5 院長室  6 ボイラー室  7 受付
   家具は壁際にだけ置く。通路の口（壁の向こうが床のところ）は塞がない。
   置く前に既存の家具・拾い物と重ならないかを見る。ゲームの乱数は引かない
   （同じ種で間取りと展開が変わらないように）。 */
var HERO = {
  1:{ sign:'ナースステーション', kit:['counter','counter','shelf','shelf','clock','charts'] },
  2:{ sign:'大部屋',             kit:['bed','bed','bed','bed','bed','bed','curtain','curtain'] },
  3:{ sign:'配電室',             kit:['cabinet','cabinet','cabinet','cabinet','cabinet','cable'] },
  4:{ sign:'階段　立入禁止',     kit:['rail','rail','rail','debris','debris','shelf'] },
  5:{ sign:'院長室',             kit:['desk','shelf','shelf','shelf','portrait','cabinet'] },
  6:{ sign:'ボイラー室',         kit:['boiler','pipe','pipe','cabinet','debris'] },
  7:{ sign:'受付',               kit:['counter','counter','charts','bench','bench','clock'] }
};
HERO[0] = HERO[1];                                         // 夜勤はナースステーション
function heroPiece(kind){
  var P = [], r = 0.6, h = 1.0, len = 2.2;
  var C = { steel:0x6f756f, dark:0x33352f, paper:0xd6cfbb, cream:0xc9c1a8, green:0x55635c, wood:0x5c4632, rust:0x6b4a33 };
  if(kind === 'counter'){ len = 3.2; h = 1.05; r = 0.9;
    P.push({ w:len, h:1.0, d:0.62, y:0.5, c:C.green }, { w:len+0.1, h:0.05, d:0.74, y:1.03, c:C.dark },
           { w:len-0.2, h:0.7, d:0.02, y:0.45, z:0.32, c:0x46514b }); }
  else if(kind === 'shelf'){ len = 2.0; h = 2.0; r = 0.8;
    P.push({ w:len, h:2.0, d:0.42, y:1.0, c:C.steel });
    for(var s=0; s<4; s++){ P.push({ w:len-0.06, h:0.03, d:0.4, y:0.3 + s*0.46, z:0.01, c:C.dark });
      for(var f=0; f<7; f++) P.push({ w:0.2, h:0.32, d:0.32, x:-len/2 + 0.2 + f*0.26, y:0.48 + s*0.46, z:0.02,
                                       c:[C.cream, 0x8c7d5c, 0x5c6b5e, C.paper][(s + f) % 4] }); } }
  else if(kind === 'bed'){ len = 2.0; h = 0.8; r = 0.95;
    P.push({ w:0.95, h:0.42, d:2.0, y:0.42, c:C.steel }, { w:0.9, h:0.14, d:1.9, y:0.7, c:C.paper },
           { w:0.6, h:0.1, d:0.34, y:0.82, z:-0.72, c:0xe8e2d4 }, { w:0.95, h:0.9, d:0.05, y:0.6, z:-1.0, c:C.steel }); }
  else if(kind === 'curtain'){ len = 2.6; h = 2.2; r = 0.15;
    P.push({ w:len, h:0.03, d:0.03, y:2.3, c:C.steel }, { w:len*0.45, h:1.9, d:0.02, x:-len*0.25, y:1.3, c:0xa9b4a8 }); }
  else if(kind === 'cabinet'){ len = 1.0; h = 2.0; r = 0.55;
    P.push({ w:0.95, h:2.0, d:0.55, y:1.0, c:C.green }, { w:0.02, h:1.8, d:0.02, x:0, y:1.0, z:0.28, c:C.dark },
           { w:0.08, h:0.08, d:0.03, x:0.3, y:1.65, z:0.29, c:0x8c2626 }, { w:0.08, h:0.08, d:0.03, x:0.18, y:1.65, z:0.29, c:0x2fae86 }); }
  else if(kind === 'cable'){ len = 3.0; h = 0.1; r = 0.2;
    for(var k=0; k<4; k++) P.push({ type:'cyl', r:0.03, h:len, ax:'x', y:0.04, z:-0.2 + k*0.09, c:C.dark }); }
  else if(kind === 'rail'){ len = 3.0; h = 1.0; r = 0.2;
    P.push({ w:len, h:0.05, d:0.06, y:1.0, c:C.steel });
    for(var k2=0; k2<5; k2++) P.push({ w:0.04, h:1.0, d:0.04, x:-len/2 + k2*len/4, y:0.5, c:C.steel }); }
  else if(kind === 'debris'){ len = 1.4; h = 0.5; r = 0.7;
    P.push({ w:0.9, h:0.4, d:0.6, y:0.2, ry:0.3, c:C.cream }, { w:0.6, h:0.3, d:0.5, x:0.4, y:0.15, ry:-0.4, c:C.rust },
           { w:1.2, h:0.05, d:0.25, y:0.45, rz:0.25, c:C.wood }); }
  else if(kind === 'desk'){ len = 2.2; h = 0.8; r = 1.0;
    P.push({ w:2.2, h:0.06, d:0.95, y:0.78, c:C.wood }, { w:0.5, h:0.75, d:0.9, x:-0.82, y:0.38, c:C.wood },
           { w:0.5, h:0.75, d:0.9, x:0.82, y:0.38, c:C.wood }, { w:0.3, h:0.02, d:0.4, x:0.2, y:0.82, c:C.paper },
           { w:0.55, h:0.9, d:0.55, z:-0.8, y:0.45, c:C.dark }); }
  else if(kind === 'portrait'){ len = 1.0; h = 1.2; r = 0.1;
    P.push({ w:0.9, h:1.15, d:0.05, y:1.8, c:0x3c3a33 }, { w:0.72, h:0.95, d:0.06, y:1.8, c:0x2a2622 },
           { w:0.3, h:0.4, d:0.07, y:1.9, c:0x6a5d4c }); }
  else if(kind === 'boiler'){ len = 2.6; h = 2.6; r = 1.3;
    P.push({ type:'cyl', r:1.1, h:2.5, y:1.25, seg:16, c:C.rust }, { type:'cyl', r:1.14, h:0.1, y:0.6, seg:16, c:C.dark },
           { type:'cyl', r:1.14, h:0.1, y:1.9, seg:16, c:C.dark }, { type:'cyl', r:0.14, h:1.2, y:3.0, seg:8, c:C.steel }); }
  else if(kind === 'pipe'){ len = 3.4; h = 0.4; r = 0.25;
    P.push({ type:'cyl', r:0.12, h:len, ax:'x', y:2.6, c:C.steel }, { type:'cyl', r:0.09, h:len, ax:'x', y:2.35, c:C.rust }); }
  else if(kind === 'clock'){ len = 0.6; h = 0.5; r = 0.05;
    P.push({ type:'cyl', r:0.28, h:0.05, ax:'z', y:2.6, seg:20, c:C.paper }, { w:0.02, h:0.2, d:0.02, y:2.68, z:0.03, c:C.dark },
           { w:0.15, h:0.02, d:0.02, x:0.06, y:2.6, z:0.03, c:C.dark }); }                      // 止まった 4 時 10 分
  else if(kind === 'charts'){ len = 1.0; h = 1.3; r = 0.5;
    P.push({ w:0.8, h:1.0, d:0.5, y:0.5, c:C.green });
    for(var k3=0; k3<6; k3++) P.push({ w:0.34, h:0.03, d:0.26, x:(k3%2)*0.02, y:1.02 + k3*0.035, ry:(k3*0.07), c:C.paper }); }
  else if(kind === 'bench'){ len = 1.8; h = 0.45; r = 0.8;
    P.push({ w:1.8, h:0.06, d:0.45, y:0.45, c:C.wood }, { w:0.06, h:0.45, d:0.4, x:-0.8, y:0.22, c:C.steel },
           { w:0.06, h:0.45, d:0.4, x:0.8, y:0.22, c:C.steel }); }
  return { parts:P, len:len, h:h, r:r };
}
var heroMat = null, heroSignTex = {};
function heroSign(text){
  if(heroSignTex[text]) return heroSignTex[text];
  var c = makeCanvas(512); c.height = 128;
  var x = c.getContext('2d');
  x.fillStyle = '#0f1513'; x.fillRect(0,0,512,128);
  x.fillStyle = '#cfc9b4'; x.fillRect(8,8,496,112);
  x.fillStyle = 'rgba(92,74,52,0.25)'; x.fillRect(8,96,496,24);          // 下の方ほど汚れている
  x.fillStyle = '#1d2a26'; x.font = 'bold 54px ' + getComputedStyle(document.body).fontFamily;
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 62);
  var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  heroSignTex[text] = t; return t;
}
function heroRoom(g, hall){
  var def = HERO[runDef().n]; if(!def || !hall) return;
  if(!heroMat) heroMat = new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:0.8, metalness:0.1,
                                                         map:TEX.grunge || null });
  var x0 = cellToWorld(hall.x, hall.y).x - CELL/2, z0 = cellToWorld(hall.x, hall.y).z - CELL/2;
  var W = hall.w*CELL, D = hall.h*CELL;
  // 壁 4 面を周回しながら、置ける所に順に置く。n=北（-Z）e=東 s=南 w=西
  var sides = [ { ax:'x', from:x0, to:x0+W, fix:z0, n:[0,1], cellFix:hall.y, outside:[0,-1] },
                { ax:'z', from:z0, to:z0+D, fix:x0+W, n:[-1,0], cellFix:hall.x+hall.w-1, outside:[1,0] },
                { ax:'x', from:x0+W, to:x0, fix:z0+D, n:[0,-1], cellFix:hall.y+hall.h-1, outside:[0,1] },
                { ax:'z', from:z0+D, to:z0, fix:x0, n:[1,0], cellFix:hall.x, outside:[-1,0] } ];
  var kit = def.kit.slice(), si = 0, cursor = 0.8, placed = 0, guard = 60;
  function blockedAt(px, pz, rr){
    for(var i=0; i<world.props.length; i++){ var o = world.props[i];
      if((o.x-px)*(o.x-px) + (o.z-pz)*(o.z-pz) < (o.r+rr+0.3)*(o.r+rr+0.3)) return true; }
    var items = world.records.concat(world.batteries, world.bottles || [], world.bandages || [], world.key ? [world.key] : []);
    for(var j=0; j<items.length; j++){ var it = items[j];
      if((it.x-px)*(it.x-px) + (it.z-pz)*(it.z-pz) < (rr+1.0)*(rr+1.0)) return true; }
    return false;
  }
  function openingAt(S, t){          // その位置の壁の向こうが通路なら、口なので塞がない
    var c = S.ax === 'x' ? worldToCell(t, S.fix + S.n[1]*0.5) : worldToCell(S.fix + S.n[0]*0.5, t);
    var ox = c.x + S.outside[0], oy = c.y + S.outside[1];
    return inBounds(ox, oy) && g[idx(ox, oy)] === 0;
  }
  while(kit.length && si < 4 && guard-- > 0){
    var S = sides[si], kind = kit[0], pc = heroPiece(kind);
    var span = Math.abs(S.to - S.from), dir = S.to > S.from ? 1 : -1;
    if(cursor + pc.len + 0.6 > span){ si++; cursor = 0.8; continue; }
    var t = S.from + dir*(cursor + pc.len/2);
    var depth = kind === 'clock' || kind === 'portrait' ? 0.06 : (kind === 'boiler' ? 1.4 : (kind === 'bed' ? 1.1 : 0.45));
    var px = S.ax === 'x' ? t : S.fix + S.n[0]*depth, pz = S.ax === 'x' ? S.fix + S.n[1]*depth : t;
    var tA = S.from + dir*cursor, tB = S.from + dir*(cursor + pc.len);
    if(openingAt(S, tA) || openingAt(S, t) || openingAt(S, tB) || (pc.r > 0.2 && blockedAt(px, pz, pc.r))){
      cursor += 1.0; continue;                 // ずらして次を試す
    }
    var m = new THREE.Mesh(mergeTinted(pc.parts), heroMat);
    m.position.set(px, 0, pz);
    m.rotation.y = Math.atan2(S.n[0], S.n[1]);                     // 部屋の内側を向く
    if(kind === 'bed') m.rotation.y += Math.PI;                    // 枕を壁側に
    /* 焼き固め（bakeStaticFurniture）には入れない。あちらは頂点色を運ばないので、
       頂点色で塗ったこの家具は真っ黒になる（自己診断が一度落とした）。1 品 1 描画のまま */
    world.group.add(m);
    /* 当たり判定には入れるが、視線は遮らせない（高さを低く登録する）。
       視線を遮る什器はロッカーだけ、という決まりで追跡者の目もボットの判断も組んであり、
       棚や配電盤で急に見えなくなると両方の前提が崩れる（自己診断が見ている） */
    if(pc.r > 0.2) world.props.push({ x:px, z:pz, r:Math.min(pc.r, 0.95), h:Math.min(pc.h, 1.2) });
    kit.shift(); cursor += pc.len + 0.5; placed++;
  }
  // 名札。北の壁の、口ではない所の目の高さより少し上に
  for(var k=0; k<7; k++){
    var sx = x0 + W*(0.3 + k*0.08);
    if(openingAt(sides[0], sx)) continue;
    var sg = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.4), new THREE.MeshStandardMaterial({ map:heroSign(def.sign), roughness:0.7 }));
    sg.position.set(sx, 2.55, z0 + 0.03);
    world.group.add(sg);
    break;
  }
  world.hero = { name:def.sign, pieces:placed };
}

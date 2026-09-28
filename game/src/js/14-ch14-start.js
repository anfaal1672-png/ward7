/* =========================================================================
   14. ゲーム開始
   ========================================================================= */
var buildInfo = null;
var startedAt = 0;

var forcedSeed = null;
var skipUI = false;
function startGame(){
  if(CTX_LOST){ toast('描画の復帰を待っています', 2); return; }
  Audio2.init();
  Audio2.setVol(settings.vol);
  Audio2.resume();
  keepAwake(true);

  var d = DIFF[settings.diff];

  QC = qualityCfg();
  renderer.setPixelRatio(effPixelRatio());
  scene.fog.density = QC.fogD;
  $('grain').style.display = (QC.cssFx && !QC.post) ? 'block' : 'none';
  /* テクスチャの作り直しは種を決める前に済ませる。
     手続き生成のテクスチャは rnd() を大量に引くので、種を決めた後に
     ここを通すと、同じ種でも間取りが変わってしまう。実際、壁の
     タイル分割を 4×4 から 12×12 にしたら（引く回数が増えたら）
     種 7 の間取りが別物になって気づいた。 */
  ensureTextures();

  /* 検証で「同じ間取りを両方の版で走らせる」ために種を固定できるようにする。
     間取りの当たり外れが変更の効果より大きく、毎回別の間取りだと n=16 では
     被弾ペースが 1.15 と 2.21 のように倍近く食い違って判断に使えない。 */
  /* 物語の章は種を固定する（第 6.1 節）。検証用の forcedSeed はそれより優先。
     夜勤は毎回違う種 */
  var rdef = runDef();
  var seedNow = (forcedSeed !== null ? forcedSeed : (rdef.seed !== null ? rdef.seed : nightSeed())) & 0x7fffffff;
  rnd = mulberry32(seedNow);
  seedStreams(seedNow);

  // 影（最高品質のみ）。マテリアルは buildWorld で作り直されるので再コンパイル問題は起きない
  renderer.shadowMap.enabled = !!QC.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;   // PCFSoft は r180 で消え、黙って PCF に落ちる
  flashlight.castShadow = !!QC.shadows;
  if(QC.shadows){
    flashlight.shadow.mapSize.width = 1024;
    flashlight.shadow.mapSize.height = 1024;
    flashlight.shadow.bias = -0.0015;
    flashlight.shadow.normalBias = 0.035;
    flashlight.shadow.camera.near = 0.4;
    flashlight.shadow.camera.far = 34;
  }

  expAdapt = 1;             // 明順応は毎回まっさらから（前回の暗さを持ち越さない）
  resetPlayerLight();
  resetHunterVox();
  buildInfo = buildWorld();
  applyPhoto();
  buildHunter();
  /* 法線の最終検め。
     生成の各所で fixNormals を通してはいるが、形の作り方は 6 通りあり、
     どれかを増やしたときに漏れる。漏れると iOS の WebGL がその部品を
     丸ごと描かない（実機で「頭と手と衣服と足だけ見える」と報告された
     不具合の正体がこれ。デスクトップのドライバは何か描いてしまうので、
     絵を見ても気づけない）。
     ここで一度シーン全体を掃けば、どの経路で作られた形でも NaN の法線が
     GPU へ出ていくことはない。1 面につき 1 回、実測 3ms 以下。 */
  sanitizeNormals(scene);
  sanitizeNormals(viewScene);
  placeHunter(buildInfo.reach, buildInfo.start);
  buildPatients(buildInfo, rdef.patients[clamp(settings.diff|0, 0, 2)] | 0);
  world.blackout = !!rdef.blackout;
  buildVents(buildInfo, rdef.vents | 0);
  buildShade(!!rdef.reflect);
  buildWater(buildInfo, !!rdef.water);
  Audio2.setWater(!!rdef.water);

  var sw = cellToWorld(buildInfo.start.x, buildInfo.start.y);
  player.x = sw.x; player.z = sw.z;
  // 開始セルがランダムになったので、壁を向いて始まらないよう開けた方角へ初期化する。
  // 前方ベクトルは (-sin yaw, -cos yaw)。yaw=0 が -Z（グリッドの y-1）方向。
  var YD = [[0,-1,0], [1,0,-Math.PI/2], [0,1,Math.PI], [-1,0,Math.PI/2]];
  player.yaw = 0;
  for(var yi=0; yi<4; yi++){
    var ynx = buildInfo.start.x + YD[yi][0], yny = buildInfo.start.y + YD[yi][1];
    if(inBounds(ynx,yny) && world.grid[idx(ynx,yny)] === 0){ player.yaw = YD[yi][2]; break; }
  }
  player.pitch = 0;
  player.hp = 100; player.battery = 100; player.stamina = 100; player.sanity = 100;
  player.sneaking = false; player.bottles = 0; clearThrows(); resetHint(); resetMap();
  player.lamp = true; player.got = 0; player.need = d.records; player.time = 0;
  world.noteOrder = buildNoteOrder(player.need);   // 読む順はその回ごとに引く
  HUDW.t = 4.0; HUDW.bat = 100; HUDW.sta = 100; HUDW.hp = 100; HUDW.got = -1;
  /* 速度を戻していなかった。タイトルへ戻って遊び直すと、前の周回が
     終わった瞬間の速度で滑り出す（死んだ位置で走っていれば 5.7 m/s）。
     再現検証で「同じ種なのに 1 本目と 2 本目で結果が違う」原因もこれ。 */
  player.vx = 0; player.vz = 0; player.hits = 0;
  player.hurtT = 0; player.deadT = 0; player.shake = 0; player.bob = 0; player.stepAcc = 0;
  player.exhausted = false; player.blockedT = 0; $('barSta').classList.remove('exh');
  player.hiding = null; player.hideSeen = false; player.holdBreath = false; player.breathBroken = 0;
  player.breathLock = false; player.hasKey = false; holdBtnDown = false;
  player.lookBackT = 0; player.viewYaw = 0; backBtnDown = false;
  $('bBack').classList.remove('hot');
  $('hideView').classList.remove('on');
  $('bHold').style.display = 'none';
  hunter.speed = d.hunterSpeed;

  $('numAll').textContent = d.records;
  $('numGot').textContent = '0';
  $('objSub').textContent = 'カルテを探せ';
  if(rdef.n) toast('第' + rdef.n + '章　' + rdef.name, 3.2);
  tele('start', { need:player.need });
  $('bLight').classList.add('hot');
  $('bUse').classList.add('dim');
  $('hurt').style.opacity = '0';

  cheatUsed = anyCheat();
  updateCheatBadge();
  input.fwd = input.side = input.lookX = input.lookY = 0;
  input.use = false; stickId = null; lookId = null; setStickVisual(false);
  stickRunning = false; stickEl.classList.remove('run');

  camera.position.set(player.x, player.y, player.z);
  camera.rotation.set(0,0,0);
  resize();
  // 暗転が明ける前に、ライト数のバリアントをまとめてコンパイルしておく
  prewarmLights();
  cullLights();      // 1フレーム目から効かせる（初回だけ 6 灯で描かないように）

  Audio2.startAmbient();
  state = STATE.PLAY;
  showPanel(null);
  startedAt = performance.now();
  blackout(true, true);
  setTimeout(function(){ blackout(false); }, 60);
  toast('カルテを ' + d.records + ' 枚 集めろ', 3);
  setTimeout(function(){
    if(state === STATE.PLAY){
      // 入力機器に合わせる（第 11.4 節）。キーは割り当てを引く
      if(lastInputKind === 'pad') toast(LANG === 'en' ? 'Left stick to move · RT to run' : '左スティックで移動 · RT で走る', 3);
      else if(lastInputKind === 'touch') toast('左で移動（大きく倒すと走る）', 3);
      else if(settings.keys && Object.keys(settings.keys).length){
        var mv = [keyOf('fwd'), keyOf('left'), keyOf('back'), keyOf('right')].map(keyLabel).join('');
        toast(LANG === 'en' ? mv + ' to move · ' + keyLabel(keyOf('run')) + ' to run' : mv + ' で移動 · ' + keyLabel(keyOf('run')) + ' で走る', 3);
      }else toast('WASD で移動 · Shift で走る', 3);
    }
  }, 3400);

  /* 環境音のタイマーは読み込み時に一度決まったきり持ち越されていた。
     種を固定しても再現しなかった原因がこれで、最初のきしみが鳴る時刻が
     プロセスごとに変わり、そこで rnd() の消費がひとつずれて以降が全部
     食い違っていた（同じ種・同じコードで被弾ペースが +52% 動いていた）。 */
  ambientCreakT = 6 + rndFx()*8;
  TIPS.cool = 5;                 // 始まりの「移動」の表示と重ねない

  buildDust();
  buildExitShaft();
  buildLampShafts();
  if(BOT.on) botReset();
  huntReset();

  if(DEBUG) runSelfTest();
}


/* =========================================================================
   20. 起動
   ========================================================================= */
/* 起動の各段にかかった時間（設計指示書 第 1.1 節「起動からタイトルまで 5 秒」の内訳）。
   load-check.js が読む */
var BOOT_T = { t0:performance.now(), steps:[] };
function bootStep(/** @type {any} */ name, /** @type {any} */ fn){ var t = performance.now(); fn(); BOOT_T.steps.push([name, Math.round(performance.now() - t)]); }
window.__W7BOOT = BOOT_T;
try{
  bootStep('grain', function(){ $('grain').style.backgroundImage = 'url(' + grainDataURL() + ')'; });
  bootStep('textures', buildTextures);
  bootStep('lights', setupLights);
  texBuiltQ = settings.quality|0;
  bootStep('post', buildPost);
  resize();
  syncSettingsUI();
  buildCheatUI();
  camera.position.set(0,1.7,0);

  if(/[?&]bot=1/.test(location.search)) BOT.on = true;

  /* タイトルの情景（病棟を丸ごと 1 つ建てる）は重いので、タイトルの画面を先に出してから建てる
     （第 1.1 節「起動からタイトルまで 5 秒」）。建つまでは背景が暗いだけで、ボタンはもう押せる。
     建つ前に「病棟に入る」が押されたら、startGame が自分で建てるのでここでは建てない */
  setTimeout(function(){
    if(state !== STATE.TITLE) return;
    // 一人称の腕と映り込みもタイトルには要らない。画面を出してから作る（startGame も要れば作る）
    if(!viewArm){ bootStep('viewModel', buildViewModel); bootStep('envMap', buildEnvMap); }
    bootStep('titleScene', buildTitleScene);
    bootStep('dust', buildDust);
    BOOT_T.scene = Math.round(performance.now() - BOOT_T.t0);
  }, 30);
  BOOT_T.total = Math.round(performance.now() - BOOT_T.t0);

  bootedOK = true;
  state = STATE.TITLE;
  showPanel('title');
  /* 消えた記録を写しから戻す（第 1 章 Store）。戻したら一度だけ読み直して
     設定と記録を最初から当て直す。二度目は戻すものが無いので繰り返さない */
  Store.recover(function(/** @type {any} */ restored){
    if(!restored) return;
    try{ if(sessionStorage.getItem('ward7.restored')) return;
         sessionStorage.setItem('ward7.restored', '1'); }catch(e){ return; }
    location.reload();
  });
  /* Web 版はオフラインでも遊べるよう Service Worker を置く（第 15.5 節）。
     https でだけ動く。file://（iOS アプリ・手元）では何もしない */
  try{ if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost'))
    navigator.serviceWorker.register('sw.js').catch(function(){}); }catch(e){}
  blackout(true, true);
  requestAnimationFrame(loop);

  // 内部診断用に公開
  window.__W7R = renderer;
  window.__WARD7 = {
    start: startGame, state: function(){ return state; },
    player: player, hunter: hunter, world: world, test: runSelfTest,
    toTitle: toTitle, setState: function(/** @type {any} */ s){ state = s; },
    audio: Audio2, spatial: spatial, camera: camera, cheats: cheats,
    viewArm: function(){ return viewArm; }, viewCam: function(){ return viewCam; },
    /* 描画の実体。検証ツールが本編だけを隠して腕を撮ったり、
       描いた画素をそのまま読んだりするのに要る（外からは触れなかった） */
    gfx: function(){ return { renderer:renderer, scene:scene, camera:camera,
                              viewScene:viewScene, viewCam:viewCam, QC:QC }; },
    viewRigRef: function(){ return viewRig; },
    lensMat: function(){ return viewParts.lens; },
    viewPartsRef: function(){ return viewParts; },
    eyeLight: function(){ return hunterEyeLight; }, flashTarget: function(){ return flashTarget; },
    losTest: function(/** @type {any} */ ax,/** @type {any} */ az,/** @type {any} */ bx,/** @type {any} */ bz){ return hasLOS(world.grid, ax, az, bx, bz); },
    sightTest: function(/** @type {any} */ ax,/** @type {any} */ az,/** @type {any} */ bx,/** @type {any} */ bz){ return hasSight(world.grid, ax, az, bx, bz); },
    propBlocks: function(/** @type {any} */ ax,/** @type {any} */ az,/** @type {any} */ bx,/** @type {any} */ bz){ return propBlocksSight(ax, az, bx, bz); },
    sightH: function(){ return SIGHT_H; },
    use: function(){ input.use = true; },
    run: RUN, chapters: CHAPTERS, progress: PROGRESS, patients: function(){ return patients; }, vents: function(){ return vents; }, shade: shade,
    spatialPath: function(/** @type {any} */ x, /** @type {any} */ z){ updatePathField(1); return spatialPath(x, z, 30, !hasLOS(world.grid, player.x, player.z, x, z)); },
    lookBack: function(/** @type {any} */ on){ backBtnDown = !!on; },
    findLOSSpot: function(/** @type {number} */ px, /** @type {number} */ pz, /** @type {any} */ minD, /** @type {any} */ maxD){
      for(var y=1;y<GH-1;y++) for(var x=1;x<GW-1;x++){
        if(world.grid[idx(x,y)] !== 0) continue;
        var w = cellToWorld(x,y);
        var dd = Math.sqrt((w.x-px)*(w.x-px) + (w.z-pz)*(w.z-pz));
        if(dd < minD || dd > maxD) continue;
        if(hasLOS(world.grid, px, pz, w.x, w.z)) return { x:w.x, z:w.z, d:dd };
      }
      return null;
    },
    texGen: { wall:texWall, floor:texFloor },
    noteOrder: function(){ return world.noteOrder; }, noteCount: function(){ return NOTES.length; },
    viewBeam: function(){ return { x:+viewBeam.x.toFixed(4), y:+viewBeam.y.toFixed(4) }; },
    // 自動露出。検証で「近い壁を向くと絞るか」を数で見るのに使う
    exposure: function(){ return { adapt:expAdapt, now:exposureNow(), hit:beamHitDist() }; },
    stepExposure: function(/** @type {number} */ dt, /** @type {any} */ lamp){ updateExposure(dt, lamp === undefined ? 1 : lamp); },
    forceQC: function(){ QC = qualityCfg(); },
    post: function(){ return { on:postEnabled(), fx:postFX,
      u: postMat ? { aberr:+postMat.uniforms.uAberr.value.toFixed(3),
                     noise:+postMat.uniforms.uNoise.value.toFixed(3),
                     scan:+postMat.uniforms.uScan.value.toFixed(3),
                     warp:+postMat.uniforms.uWarp.value.toFixed(3) } : null }; },
    bot: BOT, botOn: function(/** @type {any} */ v){ BOT.on = !!v; }, input: input,
    snapTake: snapTake, snapRestore: snapRestore,
    botHunterDist: botHunterDist, botThreat: botThreat,
    titleCam: titleCam,
    playAs: function(/** @type {any} */ v){ if(v !== undefined) playAs = v; return playAs; },
    hunterIn: HIN, huntCam: huntCam, avatarRef: function(){ return avatar; },
    humanKeys: humanKeys, stickIn: stickIn,
    seed: function(/** @type {any} */ n){ forcedSeed = (n === null || n === undefined) ? null : (n|0); },
    skipUI: function(/** @type {any} */ v){ skipUI = !!v; },
    settings: settings, act: doCheatAct,      // cheats は上で公開済み（同じキーが 2 つあった）
    peek: PEEK, peekSide: peekSide, peekOffset: peekOffset,
    openCheats: openCheats, detectMode: detectMode
  };
}catch(e){
  fatal('初期化に失敗しました: ' + (e && e.message ? e.message : e));
}


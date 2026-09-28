/* =========================================================================
   17. メインループ
   ========================================================================= */
var lastT = performance.now();
var fpsAcc = 0, fpsN = 0, fpsShown = 0;
var autoDropChecked = false, lowFpsTime = 0;

function loop(now){
  requestAnimationFrame(loop);
  var dt = (now - lastT)/1000;
  lastT = now;
  if(!isFinite(dt) || dt <= 0) return;
  /* 解像度の自動調整は実際にかかった時間で測る。遊びの dt は 0.05 で頭打ちにして
     いるので、それを渡すと 1 フレーム 200ms の端末でも 1 秒の猶予が 4 倍に延び、
     重いのに下がるのが遅れていた。タブ切り替え明けの大きな跳びだけは 0.25 で抑える */
  var realDt = Math.min(dt, 0.25);
  dt = Math.min(dt, 0.05);
  if(cheats.slowmo) dt *= 0.4;

  if(CTX_LOST) return;

  /* 着信などで音が奪われたら止めて待つ。画面は隠れないことがある（着信の帯だけ出る）ので
     visibilitychange だけでは拾えない。戻ったら「続ける」を押す＝音を戻す操作になる */
  if(state === STATE.PLAY && Audio2.state() === 'interrupted') doPause();

  if(state === STATE.PLAY){
    player.time += dt;
    // 追う側で遊ぶときは、人間の操作をボットに上書きされる前に写し取る
    if(playAs === 'hunter') captureHunterInput();
    if(BOT.on) botUpdate(dt);          // 入力を作る。updatePlayer が読む前に
    var info = updatePlayer(dt);
    if(state === STATE.PLAY){         // updatePlayer 中に勝利した可能性
      updateHunter(dt, info);
    }
    if(state === STATE.PLAY){
      var bpm = updateEnv(dt, info);
      updateHUD(dt, bpm, info);
      updateCue(dt);
      updateThrows(dt);
      updateDoor(dt);
      // 覗く：キー・パッド・ボタンのどれか。ボタンは立ち止まっていて頭を出せるときだけ出す
      PEEK.want = !!(input.keys.KeyX || PEEK.padWant || PEEK.touchWant);
      var bp = $('bPeek'), wantP = IS_TOUCH && playAs !== 'hunter' && !player.hiding &&
               Math.sqrt(player.vx*player.vx + player.vz*player.vz) < 0.3 && (PEEK.k > 0 || peekSide() !== 0);
      if((bp.style.display !== 'none') !== wantP) bp.style.display = wantP ? 'flex' : 'none';
      updatePatients(dt);
      updateWater(dt);
      if(shade.enabled){ updatePathField(dt); updateShade(dt); }
      updateHint(dt);
      markVisited();
      // 投げるボタンは瓶を持っている間だけ（隠れている間は投げられない）
      var bt = $('bThrow'), wantB = (player.bottles > 0 && !player.hiding && playAs !== 'hunter');
      if((bt.style.display !== 'none') !== wantB) bt.style.display = wantB ? 'flex' : 'none';
      if(wantB) $('nThrow').textContent = player.bottles;
      // 忍び足の表示。走りの表示（RUN）と同じ場所に出す
      var sk = $('stick'), wantS = player.sneaking && !player.running;
      if(sk.classList.contains('sneak') !== wantS){
        sk.classList.toggle('sneak', wantS);
        $('stickLbl').textContent = wantS ? '忍び足' : 'RUN';
      }
      if(playAs === 'hunter'){ updateHunterCam(dt); huntHUD(); }
      else if(BOT.on) botHUD();
    }
    // フラッシュライトのターゲット（一人称のときだけ。追う側では分身が灯す）
    if(playAs !== 'hunter')
    _v3.set(viewBeam.x, viewBeam.y, -1).normalize()
       .applyQuaternion(camera.quaternion).multiplyScalar(12).add(camera.position),
    flashTarget.position.copy(_v3);
  }

  if(state === STATE.TITLE) updateTitleScene(dt);

  // 全面パネルが出ている間は裏で描き続けない（死亡時のカメラ演出だけは描く）
  var needRender = (state === STATE.PLAY || state === STATE.DEAD || state === STATE.WIN ||
                    (state === STATE.TITLE && titleCam.ready));
  if(needRender){
    try{
      var usePost = postEnabled();
      if(usePost) renderer.setRenderTarget(postRT);
      var taaOn = usePost ? taaJitter() : false;
      renderer.autoClear = true;
      renderer.render(scene, camera);
      var taaTex = taaOn ? taaResolve() : null;
      // 光の筋と接地の陰は、手を描いて深度が消える前に作る
      var fxOn = usePost ? renderFx(dt) : false;
      var handsOn = false;
      // 脱出の演出中も手は残す。扉へ差し出したランプが最後の 1 枚に入る
      if(viewScene && (state === STATE.PLAY || state === STATE.WIN) && playAs !== 'hunter'){
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(viewScene, viewCam);
        renderer.autoClear = true;
        handsOn = true;
      }
      if(usePost){
        /* 滲みは本編を描いたあと、合成の前に作る。
           uBloom は正気度で少し強くする（視界が滲むのは不安の表現でもある） */
        var bt = QC.bloom ? renderBloom() : null;
        postMat.uniforms.tBloom.value = bt;
        postMat.uniforms.uBloom.value = bt ? (0.55 + (1 - player.sanity/100) * 0.45) : 0;
        var pu = postMat.uniforms;
        pu.tFx.value = fxOn ? fxRT.texture : null; pu.uFx.value = fxOn ? 1 : 0;
        pu.uHands.value = handsOn ? 1 : 0;
        pu.uAA.value = (QC.fxaa && settings.fxAA && !taaOn) ? 1 : 0;   // TAA の時は FXAA を重ねない
        pu.tDiffuse.value = taaTex || postRT.texture; pu.uTaa.value = taaTex ? 1 : 0;
        // 読む間の背景ぼかし。紙が出ている間だけ寄せ、追われたらすぐ戻す
        var dofT = (settings.fxDof && state === STATE.PLAY && noteT > 0 && hunter.mode !== 'chase') ? 1 : 0;
        pu.uDof.value += (dofT - pu.uDof.value) * (1 - Math.pow(dofT ? 0.2 : 0.002, dt));
        renderer.setRenderTarget(null);
        updatePost(dt);
        renderer.render(postScene, postCam);
      }
    }catch(e){
      renderer.autoClear = true;
      renderer.setRenderTarget(null);
      console.error('render error', e);
    }
  }

  updateDRS(realDt);
  updateBench(realDt);
  teleFrame(dt);
  updatePadMenu(dt);
  // FPS 監視・自動品質ダウン
  fpsAcc += dt; fpsN++;
  if(fpsAcc >= 0.5){
    fpsShown = fpsN/fpsAcc;
    if(state === STATE.PLAY && settings.quality > 0){
      if(fpsShown < 26) lowFpsTime += fpsAcc; else lowFpsTime = 0;
      if(lowFpsTime > 4 && !autoDropChecked){
        autoDropChecked = true;
        settings.quality = Math.max(0, settings.quality-1);
        QC = qualityCfg();
        renderer.setPixelRatio(effPixelRatio());
        scene.fog.density = QC.fogD;
        $('grain').style.display = QC.cssFx ? 'block' : 'none';
        // 影が不要な品質まで落ちたら、その場で影を切る
        if(!QC.bloom) dropBloom();
        if(!QC.shadows && renderer.shadowMap.enabled){
          renderer.shadowMap.enabled = false;
          if(flashlight) flashlight.castShadow = false;
          scene.traverse(function(o){
            if(!o.material) return;
            var ms = Array.isArray(o.material) ? o.material : [o.material];
            for(var mi=0; mi<ms.length; mi++) ms[mi].needsUpdate = true;
          });
        }
        saveSettings(); syncSettingsUI();
        toast('描画品質を下げました', 2.4);
      }
    }
    fpsAcc = 0; fpsN = 0;
    if(DEBUG) updateDbg();
  }
}

function updateDbg(){
  $('dbg').textContent =
    'fps ' + fpsShown.toFixed(0) +
    '\nstate ' + state +
    '\npos ' + player.x.toFixed(1) + ',' + player.z.toFixed(1) +
    '\nhunter ' + hunter.mode + ' ' + hunter.x.toFixed(1) + ',' + hunter.z.toFixed(1) +
    '\ncalls ' + renderer.info.render.calls +
    '\ntris ' + renderer.info.render.triangles;
}

/* 初回起動の実測（第 8.4 節）。タイトルの情景が出てから 1 秒の暖気を捨て、5 秒のフレーム時間の
   中央値で決める。タイトルは本編より軽いので、下げる閾値は 20ms（本編では 30ms 前後になる）、
   上げるのは 10ms を切るときだけ（上げた先で重ければ戻して終わる） */
function updateBench(dt){
  if(!BENCH.on || state !== STATE.TITLE || !titleCam.ready) return;
  BENCH.t += dt;
  if(BENCH.t < 1) return;
  BENCH.dts.push(dt * 1000);
  if(BENCH.t < 6) return;
  BENCH.on = false;
  var a = BENCH.dts.slice().sort(function(x, y){ return x - y; }), med = a[a.length >> 1] || 16;
  var q = settings.quality|0, nq = q, up = false;
  if(med > 20 && q > 0) nq = q - 1;
  else if(med < 10 && q < 3 && !BENCH.up && BENCH.round === 0){ nq = q + 1; up = true; }
  if(nq !== q && BENCH.round < 2){
    settings.quality = nq; saveSettings();
    // 上げた先で重かったら戻して終える（行き来させない）
    var last = BENCH.up && nq < q;
    Store.set('ward7.bench', JSON.stringify(last ? { done:1, q:nq, ms:+med.toFixed(1) } : { round:BENCH.round + 1, up:up }));
    toast('この端末に合わせて画質を調整しています…', 2);
    setTimeout(function(){ location.reload(); }, 700);
  }else{
    saveSettings();                                   // 決まった画質を控える（次からは仮の推定をしない）
    Store.set('ward7.bench', JSON.stringify({ done:1, q:q, ms:+med.toFixed(1) }));
  }
}

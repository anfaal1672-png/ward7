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
  dt = Math.min(dt, 0.05);
  if(cheats.slowmo) dt *= 0.4;

  if(CTX_LOST) return;

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
      updateHint(dt);
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
      renderer.autoClear = true;
      renderer.render(scene, camera);
      // 脱出の演出中も手は残す。扉へ差し出したランプが最後の 1 枚に入る
      if(viewScene && (state === STATE.PLAY || state === STATE.WIN) && playAs !== 'hunter'){
        renderer.autoClear = false;
        renderer.clearDepth();
        renderer.render(viewScene, viewCam);
        renderer.autoClear = true;
      }
      if(usePost){
        /* 滲みは本編を描いたあと、合成の前に作る。
           uBloom は正気度で少し強くする（視界が滲むのは不安の表現でもある） */
        var bt = QC.bloom ? renderBloom() : null;
        postMat.uniforms.tBloom.value = bt;
        postMat.uniforms.uBloom.value = bt ? (0.55 + (1 - player.sanity/100) * 0.45) : 0;
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
        renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, QC.pixelCap));
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


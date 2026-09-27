/* =========================================================================
   16. 終了処理
   ========================================================================= */
function doDeath(){
  if(state !== STATE.PLAY) return;
  state = STATE.DEAD;
  recordRun(false, player.hits||0);   // 演出を待たずにこの場で書く
  Audio2.scream();
  haptic([200,80,300]);
  // 顔面アップ演出
  var t0 = performance.now();
  var dur = 1500;
  (function zoom(){
    if(state !== STATE.DEAD) return;
    if(playAs === 'hunter'){
      // 追う側の視点はそのまま。倒れた相手を見下ろしたまま暗転させる
      blackout(true);
      setTimeout(function(){
        Audio2.stopAmbient();
        $('deadStats').innerHTML =
          '<b style="color:#c04040">捕らえた</b><br>' +
          '経過時間 <b>'+fmtTime(player.time)+'</b><br>' +
          '奪われたカルテ <b>'+player.got+' / '+player.need+'</b><br>' +
          '難易度 <b>'+DIFF[settings.diff].key+'</b>';
        showPanel('dead');
      }, 900);
      return;
    }
    var k = clamp((performance.now()-t0)/dur, 0, 1);
    var hx = hunter.x, hz = hunter.z;
    var dx = hx-player.x, dz = hz-player.z;
    var yaw = Math.atan2(-dx, -dz);
    camera.rotation.set(lerp(camera.rotation.x, 0.05, 0.15), yaw, (Math.random()-0.5)*0.08*(1-k));
    camera.fov = lerp(camera.fov, 42, 0.06);
    camera.updateProjectionMatrix();

    /* 掴まれたらランプを落とす。
       1.25m の至近で全灯のまま照らすと、反射率 0.18 の肌でも輝度が
       1.7 を超えて完全に飛ぶ。自動露出の下限（0.62 倍）でも足りない。
       ゲーム中いちばん見せたい場面が「白い塊」になっていた。
       手から落ちた灯りが床から照らす形にすると、飛びが収まるうえに
       顔が下から照らされる。 */
    var flick = 0.72 + 0.28*Math.abs(Math.sin(performance.now()*0.021));
    flick = lerp(0.86, flick, settings.flash);
    flashlight.intensity = LAMP_I * (1 - k*0.88);
    /* 落ちたランプは、既にある足元の補助光をそのまま床へ降ろして使う。
       専用の光源を 1 つ足すと、その 1 灯が「常に」全ての材質の
       全画素の計算に乗る（three は強さ 0 でもシェーダに含める）。
       playerLight はカメラの子なので、ローカル座標で前下方に置けば
       ちょうど手から落ちて転がった位置になる。
       強さは 1.3。3.0 だと床から 1.3m の胸で照度が 5.8 になり、
       懐中電灯を落とした意味が無くなる（今度は落ちたランプで飛ぶ）。 */
    playerLight.position.set(0.20, -1.42 + 0.10*(1-k), -0.44 - 0.30*k);
    playerLight.intensity = PLIGHT_I*(1-k) + 1.3*k*flick;
    /* 露出。この間は updateExposure が回らない（更新処理そのものが
       止まっている）ので、ここで直に書く。光を落としたぶん開ける。 */
    renderer.toneMappingExposure = EXP_BASE * EXP_Q[clamp(settings.quality|0,0,3)] *
                                   (settings.gamma || 1) * lerp(0.62, 1.18, k);
    if(k < 1) requestAnimationFrame(zoom);
    else{
      blackout(true);
      setTimeout(function(){
        Audio2.stopAmbient();
        $('deadStats').innerHTML = endTable([
          ['経過時間', fmtTime(player.time)],
          ['回収したカルテ', player.got + ' / ' + player.need],
          ['被弾', (player.hits||0) + ' 回'],
          ['難易度', DIFF[settings.diff].key],
          ['これまで', recLine(settings.diff)]
        ]) + (cheatUsed ? '<div class="warnline">チート使用のため記録に残していない</div>' : '');
        showPanel('dead');
      }, 900);
    }
  })();
}
function doWin(){
  if(state !== STATE.PLAY) return;
  state = STATE.WIN;
  /* 記録は演出（暗転 1 秒）を待たずに、勝敗が決まったこの場で書く。
     待っている間に閉じられると記録が消えるし、
     ヘッドレスの検証でも実時間のタイマーは進まない。 */
  /* 結末（設計指示書 第 20.1 節）。三通を結びつけた者が、灯りを消したまま
     扉を抜けたときだけ、もう一つの結末になる。灯りを点けたまま出れば
     いつもの脱出。チートの回・ボット・追う側では結末を数えない。 */
  var story = (!cheatUsed && !BOT.on && playAs !== 'hunter');
  var endingB = story && JOURNAL.linked && !player.lamp;
  if(story){ JOURNAL.endings[endingB ? 'B' : 'A'] = 1; saveJournal(); }
  var wasBest = !cheatUsed && (!RECS[settings.diff].best || player.time < RECS[settings.diff].best);
  recordRun(true, player.hits||0);
  Audio2.unlock();

  /* --- 脱出の一瞬 ---
     ここは暗転して結果表を出すだけだった。40 分かけてたどり着いた扉の
     向こうが、一度も映らないまま終わる。死亡側には顔面アップの演出が
     あるのに、勝ったときだけ何も起きないのは釣り合っていない。

     扉のほうへ向き直りながら踏み出し、非常口の赤い光を外の白い光へ
     変えて一気に開ける。露出も上げるので、最後は扉の形だけが残って
     画面が飛ぶ。暗転（死）に対して白飛び（生還）で対にする。 */
  var wt0 = performance.now(), wdur = 1500;
  var ex0 = world.exit ? world.exit.doorX : player.x;
  var ez0 = world.exit ? world.exit.doorZ : player.z;
  var wdx = ex0 - player.x, wdz = ez0 - player.z;
  var wlen = Math.sqrt(wdx*wdx + wdz*wdz) || 1;
  var yawT = Math.atan2(-wdx, -wdz);
  var yaw0 = camera.rotation.y;
  // 最短の回り方を選ぶ（真後ろの扉へ 350 度回らないように）
  var dyaw = yawT - yaw0;
  while(dyaw >  Math.PI) dyaw -= TAU;
  while(dyaw < -Math.PI) dyaw += TAU;
  var px0 = camera.position.x, pz0 = camera.position.z, py0 = camera.position.y;
  var eL = world.exitLight, eCol0 = eL ? eL.color.clone() : null, eInt0 = eL ? eL.intensity : 0;
  var eQ = clamp(settings.quality|0, 0, 3);
  var winDone = false;
  function winPanel(){
    if(winDone) return;
    winDone = true;
    // 借りていた光と露出を返す（タイトルの情景も同じシーンを使う）
    if(eL && eCol0){ eL.color.copy(eCol0); eL.intensity = eInt0; }
    if(exitShaft) exitShaft.material.color.setHex(0xff5a4a);
    renderer.toneMappingExposure = exposureNow();
    Audio2.stopAmbient();
    $('winEyebrow').textContent = endingB ? 'Released' : 'Discharged';
    $('winTitle').textContent = endingB ? '退院' : '脱出';
    $('winStory').textContent = !story ? '' : (endingB ? ENDING_B : ENDING_A);
    $('winStats').innerHTML =
      (playAs === 'hunter' ? '<div class="warnline">逃げられた</div>' : '') +
      endTable([
        ['脱出タイム', fmtTime(player.time) + (wasBest ? ' <em>最速</em>' : '')],
        ['被弾', (player.hits||0) + ' 回' + ((player.hits||0) === 0 ? ' <em>無傷</em>' : '')],
        ['残ランプ', Math.round(player.battery) + '%'],
        ['難易度', DIFF[settings.diff].key],
        ['これまで', recLine(settings.diff)]
      ]) + (cheatUsed ? '<div class="warnline">チート使用のため記録に残していない</div>' : '');
    showPanel('win');
  }
  if(playAs === 'hunter' || !world.exit){
    // 追う側で遊んでいるときは逃げられた側。演出は付けない
    blackout(true);
    setTimeout(winPanel, 1000);
    return;
  }
  /* 保険。演出は requestAnimationFrame で進めるので、途中でタブが
     隠れると止まる。戻れば続きから進むが、戻らないまま結果が出ない
     のは困る。実時間で見張って、遅れたら結果表へ進める。 */
  setTimeout(function(){
    if(winDone) return;
    blackout(true);
    setTimeout(winPanel, 500);
  }, wdur + 2200);
  (function outro(){
    if(state !== STATE.WIN || winDone) return;
    var k = clamp((performance.now() - wt0)/wdur, 0, 1);
    var e = k*k*(3 - 2*k);                       // 端をなめらかに
    camera.rotation.set(0.02 + 0.05*e, yaw0 + dyaw*e, 0);
    camera.position.set(px0 + (wdx/wlen)*1.35*e, py0 + 0.06*Math.sin(e*Math.PI),
                        pz0 + (wdz/wlen)*1.35*e);
    /* 立ち上がりは 3 乗にする。2 乗だと 3 割の時点で既に画面が真っ白で、
       扉も廊下も見えないまま終わっていた（実際そうなった）。
       前半は普通に見え、最後の 3 分の 1 で一気に飛ぶ形にする。 */
    var e3 = e*e*e;
    if(eL){
      // 赤い誘導灯から、外の白い光へ
      eL.color.setRGB(0.55 + 0.45*e, 0.15 + 0.85*e, 0.15 + 0.85*e);
      eL.intensity = eInt0 + 60*e3;
    }
    /* 光の筋は加算合成で、しかもカメラが円錐の内側に入る。
       ここを上げすぎると画面全体が一様に持ち上がって、光ではなく
       「白い膜」になる。控えめに。 */
    if(exitShaft){
      exitShaft.material.color.setRGB(1, 0.72 + 0.28*e, 0.55 + 0.45*e);
      exitShaft.material.opacity = 0.16 + 0.26*e3;
    }
    renderer.toneMappingExposure = exposureNow() * (1 + 1.2*e3);
    if(k < 1) requestAnimationFrame(outro);
    else { blackout(true); setTimeout(winPanel, 900); }
  })();
}
/* 結果は表で出す。カルテの表と同じ作法にして、
   ゲームの中の書類とつながって見えるようにする。 */
function endTable(rows){
  var h = '<div class="endrows">';
  for(var i=0;i<rows.length;i++)
    h += '<div class="row"><span>' + rows[i][0] + '</span><b>' + rows[i][1] + '</b></div>';
  return h + '</div>';
}

function fmtTime(s){
  var m = Math.floor(s/60), r = Math.floor(s%60);
  return m + ':' + (r<10?'0':'') + r;
}


/* 結末の文。短く、事務的な記録の文体で終える（カルテと同じ声） */
var ENDING_A =
  '非常口の扉を押し開けた。外ではなかった。\n' +
  '第七病棟の入口に立っていた。受付の上に、カルテの束が置いてある。\n' +
  'いちばん上の一枚の患者名の欄に、あなたの名前が書いてある。';
var ENDING_B =
  'ランプを消した。暗闇の中で、呼ぶ声がすぐそこまで来て、止まった。\n' +
  '「お姉ちゃん」\n' +
  '手を伸ばすと、冷たい指が触れた。怖くはなかった。\n\n' +
  '所見 06-11 追記　第七病棟、最後の患者の退院を確認。記録者 不明。';

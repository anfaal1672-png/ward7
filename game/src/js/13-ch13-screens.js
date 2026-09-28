/* =========================================================================
   13. 画面遷移
   ========================================================================= */
var panels = ['boot','title','opt','cheat','pause','dead','win','err','journal','credits'];
function showPanel(/** @type {any} */ name){
  panels.forEach(function(p){ $(p).hidden = (p !== name); });
  if(name !== null){
    if(radarEl) radarEl.hidden = true;
    if(hunterMark) hunterMark.visible = false;
  }
  var playing = (name === null);
  $('hud').classList.toggle('on', playing);
  $('touch').classList.toggle('on', playing);
  $('bPause').style.display = playing ? 'flex' : 'none';
}
function blackout(/** @type {any} */ on, /** @type {any} */ instant){
  var b = $('blackout');
  b.style.transition = instant ? 'none' : 'opacity 1.1s';
  b.style.opacity = on ? '1' : '0';
  if(instant) b.offsetHeight; // reflow
}

/* 品質の段ごとに「何が入るか」。名前だけでは何が変わるのか分からないし、
   端末に合うものを選ぶ手がかりが無い。実際に効く項目をそのまま並べる。 */
var QDESC = [
  ['軽量',   'テクスチャ 128 · 什器 24 · 画面効果なし', '古い端末向け。動作を最優先'],
  ['標準',   'テクスチャ 256 · 什器 44 · 画面効果あり', '既定。多くの端末でなめらか'],
  ['高精細', 'テクスチャ 512 · 什器 44 · <b>残響 · 埃 · 非常口の光</b>', '音の反響と空気が出る'],
  ['最高',   'テクスチャ 1024 · 什器 70 · <b>影 · 光の滲み · 追加の造形</b>', '新しい端末向け']
];
function syncQualityHint(){
  var q = clamp(settings.quality|0, 0, 3), d = QDESC[q];
  var el = $('hintQ');
  if(el) el.innerHTML = d[1] + '<br>' + d[2];
}

/* 較正見本を塗る。
   レンダラの ACES → 最終合成の曲線 → sRGB 出力、という本編と同じ順で
   1 段ずつ計算する。スライダを動かすと即座に塗り直すので、
   「この明るさなら病棟でも見える」が設定画面の中で確かめられる。
   ここを目分量の説明文で済ませると、暗すぎる／明るすぎるの相談が
   永遠に終わらない。 */
function acesApprox(/** @type {any} */ x){
  // three の ACESFilmicToneMapping と同じ近似式
  var a=2.51, b=0.03, c=2.43, d=0.59, e=0.14;
  return clamp((x*(a*x+b))/(x*(c*x+d)+e), 0, 1);
}
function toSRGB(/** @type {any} */ v){
  return v <= 0.0031308 ? v*12.92 : 1.055*Math.pow(v, 1/2.4) - 0.055;
}
var CALIB_STEPS = [0.006, 0.011, 0.020, 0.036, 0.065, 0.118];
function paintCalib(){
  var el = $('calib'); if(!el) return;
  if(!el.children.length){
    for(var i=0;i<CALIB_STEPS.length;i++) el.appendChild(document.createElement('i'));
  }
  /* 較正見本は「いま設定している明るさ」を映すものなので、
     明順応の倍率は入れない（見本が呼吸してしまう）。 */
  var post = QC.post;
  var ex = EXP_BASE * EXP_Q[clamp(settings.quality|0, 0, 3)] * (settings.gamma || 1);
  for(var k=0;k<CALIB_STEPS.length;k++){
    var lin = acesApprox(CALIB_STEPS[k] * ex);
    if(post) lin = lin / (lin + 1.05) * 1.95;      // 最終合成の曲線
    var v = Math.round(clamp(toSRGB(clamp(lin,0,1)), 0, 1) * 255);
    el.children[k].style.background = 'rgb('+v+','+(v+1)+','+v+')';
  }
}

function syncSettingsUI(){
  syncQualityHint();
  var cr = $('chartRec');
  if(cr) cr.textContent = recLine(clamp(settings.diff|0,0,2));
  Array.prototype.forEach.call($('segQ').children, function(b){
    b.setAttribute('aria-pressed', (+b.dataset.q === settings.quality) ? 'true':'false');
  });
  Array.prototype.forEach.call($('segI').children, function(b){
    b.setAttribute('aria-pressed', ((+b.dataset.i===1) === settings.invert) ? 'true':'false');
  });
  Array.prototype.forEach.call($('title').querySelectorAll('[data-diff]'), function(b){
    b.setAttribute('aria-pressed', (+b.dataset.diff === settings.diff) ? 'true':'false');
  });
  $('sens').value = settings.sens;
  $('vol').value = settings.vol;
  $('valS').textContent = (+settings.sens).toFixed(2);
  $('valV').textContent = Math.round(settings.vol*100);
  $('valQ').textContent = ['軽量','標準','高精細','最高'][settings.quality];
  $('valI').textContent = settings.invert ? 'オン' : 'オフ';
  Array.prototype.forEach.call($('segD').children, function(b){
    b.setAttribute('aria-pressed', (+b.dataset.d === settings.detect) ? 'true':'false');
  });
  $('valD').textContent = ['オフ','敵のみ','完全'][settings.detect];
  $('chartGoal').textContent = 'カルテ' + DIFF[settings.diff].records + '枚 → 非常口';
  // 章。開いていない章は押せない（夜勤はいつでも）
  Array.prototype.forEach.call($('segCh').children, function(b){
    var c = +b.dataset.ch;
    var open = c < 0 || c < PROGRESS.unlocked;
    b.disabled = !open;
    b.style.opacity = open ? '' : '0.35';
    b.setAttribute('aria-pressed', (c === RUN.ch) ? 'true' : 'false');
  });
  var rd = runDef();
  $('chDesc').textContent = (RUN.ch >= 0 ? '第' + rd.n + '章 ' + rd.name + '　' : '夜勤　') + rd.intro +
    (RUN.ch >= 0 && PROGRESS.cleared[rd.n] ? '（抜けた）' : '');
  $('fovA').value = settings.fov;
  $('valF').textContent = (settings.fov > 0 ? '+' : (settings.fov < 0 ? '' : '±')) + settings.fov;
  $('motion').value = settings.motion;
  $('valM').textContent = Math.round(settings.motion*100);
  $('flash').value = settings.flash;
  $('valL').textContent = Math.round(settings.flash*100);
  Array.prototype.forEach.call($('segC').children, function(b){
    b.setAttribute('aria-pressed', ((+b.dataset.c===1) === settings.cues) ? 'true':'false');
  });
  $('valC').textContent = settings.cues ? 'オン' : 'オフ';
  Array.prototype.forEach.call($('segL').children, function(b){
    b.setAttribute('aria-pressed', (b.dataset.l === settings.lang) ? 'true' : 'false');
  });
  Array.prototype.forEach.call($('segH').children, function(b){
    b.setAttribute('aria-pressed', ((+b.dataset.h === 1) === settings.hrtf) ? 'true' : 'false');
  });
  $('valH').textContent = settings.hrtf ? 'ヘッドホン' : 'スピーカー';
  Array.prototype.forEach.call($('segT').children, function(b){
    b.setAttribute('aria-pressed', ((+b.dataset.t === 1) === settings.tele) ? 'true' : 'false');
  });
  $('valT').textContent = settings.tele ? 'オン' : 'オフ';
  [['segSH','valSH','safeHide'], ['segSS','valSS','softScare'], ['segLH','valLH','lefty'],
   ['segHP','valHP','haptics'], ['segFB','valFB','fxBeam'], ['segFO','valFO','fxAO'], ['segFA','valFA','fxAA'], ['segFD','valFD','fxDof']].forEach(function(e){
    Array.prototype.forEach.call($(e[0]).children, function(b){
      b.setAttribute('aria-pressed', ((+b.dataset.v === 1) === !!settings[e[2]]) ? 'true' : 'false');
    });
    $(e[1]).textContent = settings[e[2]] ? 'オン' : 'オフ';
  });
  document.body.classList.toggle('lefty', !!settings.lefty);
  teleLoad(); $('teleN').textContent = TELE.ev.length ? '（いま ' + TELE.ev.length + ' 件）' : '';
  Audio2.setHRTF(settings.hrtf);
  $('gam').value = settings.gamma;
  $('valG').textContent = (+settings.gamma).toFixed(2);
  paintCalib();
  renderer.toneMappingExposure = exposureNow();
}

// --- チートUI ---
var cheatReturn = 'title';
function updateCheatBadge(){ $('cheatBadge').hidden = !anyCheat(); }
function buildCheatUI(){
  var list = $('cheatList'); list.innerHTML = '';
  var lastG = /** @type {any} */ (null);
  CHEATS.forEach(function(c){
    if(c.g && c.g !== lastG){
      lastG = c.g;
      var hd2 = document.createElement('div');
      hd2.className = 'sect';
      hd2.textContent = ({身:'自分', 隠:'見つからない', 速:'動き',
                          敵:'追跡者', 眼:'見え方', 他:'その他'})[c.g] || c.g;
      list.appendChild(hd2);
    }
    var row = document.createElement('div'); row.className = 'trow';
    var lab = document.createElement('span'); lab.textContent = c.label;
    var btn = document.createElement('button'); btn.type = 'button';
    function sync(){
      btn.setAttribute('aria-pressed', cheats[c.k] ? 'true' : 'false');
      btn.textContent = cheats[c.k] ? 'ON' : 'OFF';
    }
    sync();
    btn.addEventListener('click', function(){
      cheats[c.k] = !cheats[c.k];
      if(cheats[c.k]) cheatUsed = true;
      sync(); saveCheats(); updateCheatBadge();
    });
    row.appendChild(lab); row.appendChild(btn); list.appendChild(row);
  });
  var acts = $('cheatActs'); acts.innerHTML = '';
  CHEAT_ACTS.forEach(function(a){
    var b = document.createElement('button');
    b.type = 'button'; b.className = 'btn ghost'; b.textContent = a.label;
    b.addEventListener('click', function(){ doCheatAct(a.k); });
    acts.appendChild(b);
  });
  updateCheatBadge();
}
function doCheatAct(/** @type {any} */ k){
  if(state !== STATE.PLAY && state !== STATE.PAUSE){
    toast('プレイ中のみ使えます', 2); return;
  }
  cheatUsed = true; updateCheatBadge();
  if(k === 'records'){
    world.records.forEach(function(/** @type {any} */ r){
      if(r.taken) return;
      r.taken = true; r.mesh.visible = false; r.spr.visible = false; player.got++;
    });
    $('numGot').textContent = player.got;
    if(player.got >= player.need && world.exit && !world.exit.open){
      world.exit.open = true;
      world.exit.door.emissive.setHex(0x2fae86);
      world.exit.sign.color.setHex(0x6fbfa8);
      world.exitLight.color.setHex(0x6fbfa8);
      world.exitLight.intensity = 1.6;
      $('objSub').textContent = '非常口へ走れ';
      world.endgame = true;
      Audio2.unlock();
    }
    toast('カルテを全回収した', 2);
  }else if(k === 'key'){
    if(world.key && !world.key.taken){
      world.key.taken = true;
      world.key.grp.visible = false; world.key.spr.visible = false;
    }
    player.hasKey = true;
    toast('鍵を手に入れた', 2);
  }else if(k === 'openDoor'){
    if(world.lockDoor && !world.lockDoor.open){
      world.lockDoor.open = true;
      if(world.lockDoor.group) world.lockDoor.group.visible = false;
      toast('施錠扉を開けた', 2);
    }else toast('開ける扉がない', 2);
  }else if(k === 'stun'){
    hunter.stunT = 10; hunter.swingT = 0;
    toast('追跡者を止めた', 2);
  }else if(k === 'teleHunter'){
    // 自分からいちばん遠い到達可能なマスへ飛ばす
    var far2 = null, fd = -1, reach2 = buildInfo && buildInfo.reach;
    if(reach2){
      for(var ti2=0; ti2<reach2.length; ti2++){
        var w3 = cellToWorld(reach2[ti2].x, reach2[ti2].y);
        var dd3 = (w3.x-player.x)*(w3.x-player.x) + (w3.z-player.z)*(w3.z-player.z);
        if(dd3 > fd){ fd = dd3; far2 = w3; }
      }
    }
    if(far2){
      hunter.x = far2.x; hunter.z = far2.z;
      hunter.target = null; hunter.lastSeen = null; hunter.memT = 0; hunter.mode = 'patrol';
      toast('追跡者を飛ばした（' + Math.round(Math.sqrt(fd)) + 'm 先）', 2);
    }
  }else if(k === 'battery'){
    world.batteries.forEach(function(/** @type {any} */ q){
      if(q.taken) return;
      q.taken = true; q.mesh.visible = false; q.spr.visible = false;
    });
    player.battery = 100;
    toast('電池を全部集めた', 2);
  }else if(k === 'mapAll'){
    if(BOT.known){
      for(var mi=0; mi<BOT.known.length; mi++)
        BOT.known[mi] = (world.grid[mi] === 0) ? 1 : 2;
      toast('地図を全部知った', 2);
    }else toast('AI観戦モードでのみ使えます', 2);
  }else if(k === 'win'){
    toast('脱出した', 1.2); doWin();
  }else if(k === 'lose'){
    player.hp = 0; toast('力尽きた', 1.2); doDeath();
  }else if(k === 'heal'){
    player.hp = 100; player.battery = 100; player.stamina = 100; player.sanity = 100;
    toast('全回復した', 2);
  }else if(k === 'warp'){
    if(world.exit){ player.x = world.exit.x; player.z = world.exit.z; player.vx = player.vz = 0; }
    toast('非常口へ移動した', 2);
  }else if(k === 'push'){
    var reach = buildInfo && buildInfo.reach;
    if(reach && reach.length){
      var far = null, bd = -1;
      for(var i=0;i<reach.length;i++){
        var w = cellToWorld(reach[i].x, reach[i].y);
        var dd = (w.x-player.x)*(w.x-player.x) + (w.z-player.z)*(w.z-player.z);
        if(dd > bd){ bd = dd; far = w; }
      }
      if(far){
        hunter.x = far.x; hunter.z = far.z;
        hunter.mode = 'patrol'; hunter.memT = 0; hunter.chaseT = 0;
        hunter.target = null; hunter.patrolGoal = null; hunter.spawnGrace = 2;
      }
    }
    toast('追跡者を引き離した', 2);
  }
}
function openCheats(/** @type {any} */ from){
  cheatReturn = from;
  buildCheatUI();
  showPanel('cheat');
}

$('title').querySelectorAll('[data-diff]').forEach(function(/** @type {any} */ b){
  b.addEventListener('click', function(){ settings.diff = +b.dataset.diff; saveSettings(); syncSettingsUI(); });
});
$('segQ').querySelectorAll('button').forEach(function(/** @type {any} */ b){
  b.addEventListener('click', function(){
    settings.quality = +b.dataset.q; saveSettings(); syncSettingsUI();
    BENCH.on = false; Store.set('ward7.bench', JSON.stringify({ done:1, manual:1 }));   // 人が選んだら自動で変えない
    // アンチエイリアス・法線マップ・テクスチャ解像度は初期化時に決まるため、
    // 取りこぼしなく反映させる目的で読み込み直す（設定は保存済み）
    $('valQ').textContent = '適用中…';
    setTimeout(function(){ location.reload(); }, 300);
  });
});
$('segI').querySelectorAll('button').forEach(function(/** @type {any} */ b){
  b.addEventListener('click', function(){ settings.invert = (+b.dataset.i === 1); saveSettings(); syncSettingsUI(); });
});
$('gam').addEventListener('input', /** @this {HTMLInputElement} */ function(){
  settings.gamma = +this.value;
  $('valG').textContent = settings.gamma.toFixed(2);
  paintCalib();
  renderer.toneMappingExposure = exposureNow();
  saveSettings();
});
Array.prototype.forEach.call($('segT').children, function(b){
  b.addEventListener('click', function(){ settings.tele = (+b.dataset.t === 1); syncSettingsUI(); saveSettings(); });
});
$('btnTeleOut').addEventListener('click', teleExport);
[['segSH','safeHide'], ['segSS','softScare'], ['segLH','lefty'],
 ['segHP','haptics'], ['segFB','fxBeam'], ['segFO','fxAO'], ['segFA','fxAA'], ['segFD','fxDof']].forEach(function(e){
  Array.prototype.forEach.call($(e[0]).children, function(b){
    b.addEventListener('click', function(){ settings[e[1]] = (+b.dataset.v === 1); syncSettingsUI(); saveSettings(); });
  });
});
/* 立体音響の切り替えは、次に病棟へ入ったときの音から効く（持続音のバスは入るときに作る） */
Array.prototype.forEach.call($('segH').children, function(b){
  b.addEventListener('click', function(){ settings.hrtf = (+b.dataset.h === 1); syncSettingsUI(); saveSettings(); });
});
/* 言語を変えたら読み直す。訳は文字が画面に入る瞬間に掛けているので、
   すでに出ている英語を日本語へ戻す手段を持たない（持つ必要もない） */
Array.prototype.forEach.call($('segL').children, function(b){
  b.addEventListener('click', function(){
    if(b.dataset.l === settings.lang) return;
    settings.lang = b.dataset.l; saveSettings();
    setTimeout(function(){ location.reload(); }, 80);
  });
});
$('fovA').addEventListener('input', /** @this {HTMLInputElement} */ function(){ settings.fov = +this.value|0; syncSettingsUI(); saveSettings(); });
$('motion').addEventListener('input', /** @this {HTMLInputElement} */ function(){ settings.motion = +this.value; syncSettingsUI(); saveSettings(); });
$('flash').addEventListener('input', /** @this {HTMLInputElement} */ function(){ settings.flash = +this.value; syncSettingsUI(); saveSettings(); });
Array.prototype.forEach.call($('segC').children, function(b){
  b.addEventListener('click', function(){ settings.cues = (+b.dataset.c === 1); syncSettingsUI(); saveSettings(); });
});
$('sens').addEventListener('input', /** @this {HTMLInputElement} */ function(){ settings.sens = +this.value; $('valS').textContent = settings.sens.toFixed(2); saveSettings(); });
$('vol').addEventListener('input', /** @this {HTMLInputElement} */ function(){ settings.vol = +this.value; $('valV').textContent = Math.round(settings.vol*100); Audio2.setVol(settings.vol); saveSettings(); });

$('segD').querySelectorAll('button').forEach(function(/** @type {any} */ b){
  b.addEventListener('click', function(){ settings.detect = +b.dataset.d; saveSettings(); syncSettingsUI(); });
});
$('btnCheat').addEventListener('click', function(){ openCheats('title'); });
$('btnPauseCheat').addEventListener('click', function(){ openCheats('pause'); });
$('btnCheatBack').addEventListener('click', function(){ showPanel(cheatReturn); });
$('btnOpt').addEventListener('click', function(){ showPanel('opt'); });
$('btnJournal').addEventListener('click', function(){ openJournal('title'); });
$('btnCredits').addEventListener('click', function(){ showPanel('credits'); });
$('btnCreditsBack').addEventListener('click', function(){ showPanel('title'); });
$('btnPauseJournal').addEventListener('click', function(){ openJournal('pause'); });
$('btnJournalBack').addEventListener('click', function(){ showPanel(journalReturn); });
$('btnOptBack').addEventListener('click', function(){ showPanel('title'); });
$('btnStart').addEventListener('click', function(){ playAs = 'survivor'; BOT.on = false; startGame(); });
// 観戦モード。?bot=1 でも入れる
// AI に遊ばせるのは開発用（QA・バランス測定。設計指示書 第 5.8 節）。?debug=1 のときだけ出す
if(DEBUG) $('btnBot').hidden = false;
$('btnBot').addEventListener('click', function(){ playAs = 'survivor'; BOT.on = true; startGame(); });
// 追う側。逃げる側はボットが動かす
$('btnHunt').addEventListener('click', function(){ playAs = 'hunter'; BOT.on = true; startGame(); });
$('btnResume').addEventListener('click', function(){ doResume(); });
$('btnQuit').addEventListener('click', function(){ toTitle(); });
$('btnRetry').addEventListener('click', function(){ startGame(); });
/* 章を抜けたあとの「もう一度」は「次の章へ」に変わる（第 16 章 doWin が文字を差し替える） */
$('btnAgain').addEventListener('click', function(){
  if(RUN.ch >= 0 && RUN.nextCh !== undefined && RUN.nextCh !== null){ RUN.ch = RUN.nextCh; RUN.nextCh = null; }
  startGame();
});
Array.prototype.forEach.call($('segCh').children, function(b){
  b.addEventListener('click', function(){
    if(b.disabled) return;
    RUN.ch = +b.dataset.ch; syncSettingsUI();
  });
});
$('btnDeadTitle').addEventListener('click', function(){ toTitle(); });
$('btnWinTitle').addEventListener('click', function(){ toTitle(); });

function doPause(){
  if(state !== STATE.PLAY) return;
  state = STATE.PAUSE;
  /* いまの一回がどうなっているかを、止めた画面でも見せる。
     操作説明だけを出しても、続けるかやめるかの判断材料にならない。 */
  $('pauseStats').innerHTML = endTable([
    ['経過時間', fmtTime(player.time)],
    ['カルテ', player.got + ' / ' + player.need],
    ['鍵', player.hasKey ? '所持' : '未所持'],
    ['被弾', (player.hits||0) + ' 回'],
    ['難易度', DIFF[settings.diff].key]
  ]);
  showPanel('pause');
  drawMap();
  $('pauseMap').style.display = (playAs === 'hunter') ? 'none' : '';
  $('pauseHint').innerHTML = (playAs === 'hunter')
    ? (IS_TOUCH
        ? '左半分でドラッグ＝移動（大きく倒すと突進）<br>右半分でドラッグ＝視点<br>触れれば殴る。殴った直後は自分も固まる<br>相手はこちらより速い。曲がり角で待て'
        : 'WASD＝移動　マウス＝視点　Shift＝突進<br>触れれば殴る。殴った直後は自分も固まる<br>相手はこちらより速い。曲がり角で待て')
    : IS_TOUCH
    ? '左半分でドラッグ＝移動（大きく倒すと走る）<br>右半分でドラッグ＝視点　LAMP＝ランプ　拾う＝回収<br>後ろを見る＝長押しで振り返る（走りながら可）<br>隠れている間は「息を止める」で気配を消せる'
    : 'WASD＝移動　マウス＝視点　Shift＝走る<br>F＝ランプ　E＝回収／隠れる　Q＝後ろを見る<br>Esc＝一時停止　隠れている間は Shift で息を止める';
  Audio2.suspend();
  if(pointerLocked && document.exitPointerLock) document.exitPointerLock();
}
function doResume(){
  if(state !== STATE.PAUSE) return;
  state = STATE.PLAY;
  showPanel(null);
  Audio2.resume();
  keepAwake(true);
  input.fwd = input.side = 0; stickId = null; lookId = null; setStickVisual(false);
}
function toTitle(){
  state = STATE.TITLE;
  keepAwake(false);
  // 遊んだ後のワールドをそのまま情景に使う。建て直すと待たされる
  if(world.grid){
    titleCam.x = player.x; titleCam.z = player.z; titleCam.yaw = player.yaw; titleCam.t = 0;
    titleCam.ready = true;
  }
  Audio2.stopAmbient();
  if(hunter.group){ hunter.group.visible = false; hunter.shadow.visible = false; }
  if(hunterEyeLight) hunterEyeLight.intensity = 0;
  /* 死亡演出で足元の補助光を床へ降ろして強くしてある。タイトルの情景も
     同じシーンと同じカメラで描くので、戻さないと廊下の床だけが
     暖色で明るいままになる。 */
  resetPlayerLight();
  blackout(true, true);
  showPanel('title');
}

document.addEventListener('visibilitychange', function(){
  if(document.hidden && state === STATE.PLAY) doPause();
  if(!document.hidden && wakeWant) keepAwake(true);   // 隠れた間に手放されている
});
window.addEventListener('blur', function(){ if(state === STATE.PLAY) doPause(); });

/* キーの割り当ての画面（設計指示書 第 12.3 節）。指だけの端末（細かい指し示しが無い）では出さない */
function buildKeyUI(){
  var list = $('keyList'); if(!list) return;
  var fine = !window.matchMedia || window.matchMedia('(pointer:fine)').matches || !IS_TOUCH;
  $('keysSect').hidden = !fine; $('keysField').hidden = !fine;
  list.innerHTML = '';
  KEYACT.forEach(function(k){
    var row = document.createElement('div'); row.className = 'keyrow';
    var lb = document.createElement('span'); lb.textContent = k.label;
    var bt = document.createElement('button'); bt.type = 'button'; bt.className = 'keybtn';
    bt.textContent = keyLabel(keyOf(k.a));
    bt.addEventListener('click', function(){
      bt.textContent = 'キーを押す…'; bt.classList.add('wait');
      keyCapture = function(/** @type {any} */ code){
        bt.classList.remove('wait');
        if(code !== 'Escape'){
          /* 他の操作が同じキーを主キーにしていたら、入れ替える（1 つのキーに 2 つの操作を載せず、
             取られた側も主キーを失わない） */
          var prev = keyOf(k.a);
          KEYACT.forEach(function(o){
            if(o.a !== k.a && keyOf(o.a) === code){ if(prev === o.canon) delete settings.keys[o.a]; else settings.keys[o.a] = prev; }
          });
          if(code === k.canon) delete settings.keys[k.a]; else settings.keys[k.a] = code;
          rebuildKeymap(); saveSettings();
        }
        buildKeyUI();
      };
    });
    row.appendChild(lb); row.appendChild(bt); list.appendChild(row);
  });
}
$('btnKeysReset').addEventListener('click', function(){ settings.keys = {}; rebuildKeymap(); saveSettings(); buildKeyUI(); });
buildKeyUI();

/* タッチのボタンの配置（設計指示書 第 12.1 節「ボタンの配置を指で動かせる」）。
   位置は画面に対する中心の割合で持つので、縦横や機種が変わっても同じ辺りに来る。
   置いていないボタンは CSS の既定（左手持ちならその配置）のまま */
var LAYOUT_IDS = ['bUse', 'bLight', 'bBack', 'bHold', 'bThrow', 'bPeek'];
var layoutEdit = /** @type {any} */ (null);
function btnHalf(/** @type {any} */ el){ var cs = getComputedStyle(el); return { w:(parseFloat(cs.width) || 64)/2, h:(parseFloat(cs.height) || 64)/2 }; }
function applyBtnLayout(){
  LAYOUT_IDS.forEach(function(id){
    var el = $(id), p = settings.btnPos && settings.btnPos[id];
    if(!el) return;
    if(p){
      var hh = btnHalf(el);
      el.style.left = 'calc(' + (p.x*100).toFixed(2) + '% - ' + hh.w + 'px)';
      el.style.top = 'calc(' + (p.y*100).toFixed(2) + '% - ' + hh.h + 'px)';
      el.style.right = 'auto'; el.style.bottom = 'auto';
    }else{ el.style.left = el.style.top = el.style.right = el.style.bottom = ''; }
  });
}
function openLayoutEdit(){
  var t = $('touch');
  layoutEdit = { disp:{}, drag:null, wasOn:t.classList.contains('on') };
  LAYOUT_IDS.forEach(function(id){ layoutEdit.disp[id] = $(id).style.display; $(id).style.display = 'flex'; });
  $('opt').hidden = true;
  t.classList.add('on', 'edit');
  $('layoutBar').hidden = false;
}
function closeLayoutEdit(){
  if(!layoutEdit) return;
  var t = $('touch');
  LAYOUT_IDS.forEach(function(id){ $(id).style.display = layoutEdit.disp[id]; });
  t.classList.remove('edit'); if(!layoutEdit.wasOn) t.classList.remove('on');
  $('layoutBar').hidden = true;
  $('opt').hidden = false;
  layoutEdit = null;
  saveSettings();
}
// 編集中は捕獲の段で拾い、ボタン本来の働き（ランプを点けるなど）には渡さない
$('touch').addEventListener('pointerdown', function(/** @type {any} */ e){
  if(!layoutEdit) return;
  var el = e.target && e.target.closest ? e.target.closest('.tbtn') : null;
  e.preventDefault(); e.stopPropagation();
  if(!el || LAYOUT_IDS.indexOf(el.id) < 0) return;
  layoutEdit.drag = { id:el.id, pid:e.pointerId };
  try{ el.setPointerCapture(e.pointerId); }catch(err){}
}, true);
window.addEventListener('pointermove', function(e){
  if(!layoutEdit || !layoutEdit.drag || e.pointerId !== layoutEdit.drag.pid) return;
  settings.btnPos[layoutEdit.drag.id] = { x:clamp(e.clientX / window.innerWidth, 0.05, 0.95),
                                          y:clamp(e.clientY / window.innerHeight, 0.08, 0.95) };
  applyBtnLayout();
}, true);
window.addEventListener('pointerup', function(e){
  if(layoutEdit && layoutEdit.drag && e.pointerId === layoutEdit.drag.pid) layoutEdit.drag = null;
}, true);
$('btnLayout').addEventListener('click', openLayoutEdit);
$('btnLayoutDone').addEventListener('click', closeLayoutEdit);
$('btnLayoutReset').addEventListener('click', function(){ settings.btnPos = {}; applyBtnLayout(); });
if(!IS_TOUCH) $('layoutField').hidden = true;         // 画面のボタンが無い端末では出さない
applyBtnLayout();

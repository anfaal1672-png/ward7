/* =========================================================================
   12. HUD
   ========================================================================= */
var ecg = $('ecg'), ecgCtx = ecg.getContext('2d');
var ecgData = new Float32Array(220), ecgHead = 0, ecgBeat = 0, ecgT = 0;
var toastT = 0, noteT = 0;

// カルテの中身。拾った順に出る
/* カルテの文面。
   8 枚しか無く、しかも難易度ごとに出る順番が固定だったので、二周目からは
   同じ紙を同じ順で読むことになっていた。18 枚に増やし、順番はその回の種から
   引く。最後の 1 枚（閉じの文）だけは必ず最後に来るようにする——
   全部集めた瞬間に病棟の様子が変わるので、そこに文面を合わせる。

   声は 3 つ。夜勤の看護記録、患者が残した書き置き、院長名義の通達。
   同じ出来事を別の立場から書いているものを混ぜてある。 */
var NOTE_LAST = 17;                    // 閉じの文。必ず最後に出す
var NOTES = [
  ['所見 04-02', '夜間、第七病棟の患者が廊下を歩き回る。制止しても反応がない。翌朝は全員、何も覚えていないと言う。'],
  ['所見 04-09', '同室の四名が同じ夢を訴えた。長い髪の女が枕元に立ち、こちらを覗き込んでいる、と。'],
  ['所見 04-17', '夜勤中、階段の踊り場で足音を聞いた。上でも下でもなく、同じ場所で足踏みをしている音だった。'],
  ['所見 04-24', '第七病棟の消灯後、非常灯だけが点いている。電源は落としてあるはずだ。配線図を取り寄せた。'],
  ['配線記録',   '第七病棟の非常回路は本館と切り離されている。図面には無い線が一本、地下へ伸びている。'],
  ['所見 05-01', '七名が同時に発症。共通する所見はない。全員が同じ方向を向いて座っている。'],
  ['書き置き',   'ここの明かりは、点けると見つかる。消すと歩けない。どちらかを選べということらしい。'],
  ['所見 05-08', '患者の一人が私の名を呼んだ。名札は外している。声は、私が去年亡くした妹のものだった。'],
  ['所見 05-14', '彼女の病室から鍵を回収した。中には誰もいない。ベッドの窪みはまだ温かかった。'],
  ['書き置き',   'ロッカーの中は安全だ。ただし入るところを見られてはいけない。見られたら、扉は開けられる。'],
  ['所見 05-19', '同じ患者を三度収容した。三度とも別の病室から現れた。移動の経路が説明できない。'],
  ['所見 05-23', '同僚が三人辞めた。理由を訊いても誰も口をきかない。私も明日で辞める。'],
  ['通達 05-28', '第七病棟における記録の持ち出しを禁ずる。カルテは全て院内に留め置くこと。院長'],
  ['書き置き',   '走れば逃げられる。あれは思ったより遅い。ただし、こちらが息を切らすまでの話だ。'],
  ['所見 06-02', '院長より第七病棟の閉鎖を通達。患者の移送記録は、どこにも残っていない。'],
  ['通達 06-05', '第七病棟を封鎖する。以後の立ち入りを禁ずる。当該病棟に関する問い合わせには応じない。'],
  ['書き置き',   '扉には鍵がかかっている。鍵は誰かが持ち出した。持ち出した誰かも、まだこの中にいる。'],
  ['所見 06-11', 'まだここにいる。出口の場所が思い出せない。これを読んでいる人へ——ランプを消しなさい。']
];

/* 看護師の私信（設計指示書 第 20.1 節、隠し結末の道筋）。
   所見と同じ筆跡で、去年亡くした妹に宛てている。1 回の脱出行につき
   1 通ずつ、まだ読んでいない順に出る（2 枚目のカルテの代わりに）。
   7 通のうち 3 通だけが、妹の「声」がまだ病棟の中にいることを語る。
   その 3 通を手帳で結びつけた者だけが、最後の扉の前で灯りを消す意味を知る。 */
var LETTERS = [
  ['私信 一', '美和へ。今日から夜勤に入る。第七病棟は静かなところだと聞いていた。静かなのは、誰も口をきかないからだった。'],
  ['私信 二', '美和へ。あなたの三回忌の日取りが決まったと母から電話があった。行けそうにない。ここを離れると、何かが私の代わりに廊下を歩く気がする。'],
  ['私信 三', '美和へ。病棟で、あなたの鼻歌を聞いた。小さい頃に私が歌ってあげた子守唄。窓の外ではなく、壁の中から。'],
  ['私信 四', '美和へ。手回しのランプを借りた。回している間だけ灯る。回している間、音がする。音がすると、あれが来る。'],
  ['私信 五', '美和へ。夜中にあなたが私の名前を呼んだ。振り向かなかった。振り向いたら、あなたではないと分かってしまうから。'],
  ['私信 六', '美和へ。記録を持ち出すなと言われた。だから、ここに残していく。誰かが拾ったら、それが私だったと分かるように。'],
  ['私信 七', '美和へ。暗いところは怖くないと、あなたは言っていた。灯りを消せば、向こうからは見えない。灯りを消せば、やっとこちらからも見える。']
];
var LETTER_SISTER = [2, 4, 6];          // 妹の声がまだここにいると語る 3 通
var LETTER_SLOT = 1;                    // 何枚目のカルテ（0 始まり）の代わりに出すか

/* 手帳。読んだものは周回をまたいで残る（Store へ）。
   notes/letters は読んだ番号、linked は 3 通を結びつけ終えたか、
   endings は見た結末。 */
var JOURNAL = { notes:/** @type {Object<string, any>} */ ({}), letters:/** @type {Object<string, any>} */ ({}), linked:false, endings:/** @type {Object<string, any>} */ ({}) };
try{
  var j0 = JSON.parse(Store.get('ward7.journal') || 'null');
  if(j0 && typeof j0 === 'object'){
    if(j0.notes && typeof j0.notes === 'object') JOURNAL.notes = j0.notes;
    if(j0.letters && typeof j0.letters === 'object') JOURNAL.letters = j0.letters;
    JOURNAL.linked = !!j0.linked;
    if(j0.endings && typeof j0.endings === 'object') JOURNAL.endings = j0.endings;
  }
}catch(e){}
function saveJournal(){ Store.set('ward7.journal', JSON.stringify(JOURNAL)); }
function nextLetter(){
  for(var i=0; i<LETTERS.length; i++) if(!JOURNAL.letters[i]) return i;
  return -1;
}
function lettersRead(){
  var n = 0; for(var i=0; i<LETTERS.length; i++) if(JOURNAL.letters[i]) n++;
  return n;
}

/* その回に出す順番を種から引く。閉じの文は取り置いて最後に足す。
   同じ紙を二度出さない（need は最大 6 枚、候補は 17 枚あるので必ず足りる）。 */
function buildNoteOrder(/** @type {any} */ need){
  var pool = /** @type {number[]} */ ([]);
  for(var i=0;i<NOTES.length;i++) if(i !== NOTE_LAST) pool.push(i);
  for(var j=pool.length-1; j>0; j--){          // Fisher-Yates
    var k = (rnd() * (j+1)) | 0;
    var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
  }
  var out = pool.slice(0, Math.max(0, need-1));
  out.push(NOTE_LAST);
  return out;
}
function showNote(/** @type {any} */ i){
  var order = world.noteOrder || buildNoteOrder(player.need || 5);
  var ni = order[i % order.length] % NOTES.length;
  var n = NOTES[ni];
  /* 私信は決まった 1 枚の代わりに出る。閉じの文（最後の 1 枚）は奪わない。
     チートの回や追う側では出さない（手帳は遊んだ記録なので） */
  var li = (i === LETTER_SLOT && i < (player.need||5) - 1 && !cheatUsed && !BOT.on && playAs !== 'hunter')
           ? nextLetter() : -1;
  if(li >= 0){ n = LETTERS[li]; JOURNAL.letters[li] = 1; }
  else if(!BOT.on && playAs !== 'hunter'){ JOURNAL.notes[ni] = 1; }
  if(!BOT.on && playAs !== 'hunter') saveJournal();
  $('noteHead').textContent = n[0];
  $('noteBody').textContent = n[1];
  $('note').classList.add('on');
  noteT = 7.5;
}

function toast(/** @type {any} */ msg, /** @type {any} */ dur){
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  toastT = dur || 2;
}
function updateBar(/** @type {any} */ id, /** @type {any} */ v){
  var el = $(id).firstElementChild;
  el.style.transform = 'scaleX(' + clamp(v,0,1).toFixed(3) + ')';
}
function drawECG(/** @type {number} */ dt, /** @type {any} */ bpm){
  ecgT += dt;
  var interval = 60/bpm;
  var w = ecg.width, h = ecg.height;
  var advance = Math.max(1, Math.round(dt * 150));
  for(var i=0;i<advance;i++){
    ecgBeat += (1/150);
    var v = 0;
    var ph = (ecgBeat % interval) / interval;
    if(ph < 0.04)      v = ph/0.04 * 0.25;
    else if(ph < 0.07) v = 0.25 - (ph-0.04)/0.03 * 0.45;
    else if(ph < 0.10) v = -0.2 + (ph-0.07)/0.03 * 1.2;
    else if(ph < 0.14) v = 1.0 - (ph-0.10)/0.04 * 1.35;
    else if(ph < 0.18) v = -0.35 + (ph-0.14)/0.04 * 0.35;
    else if(ph < 0.30) v = Math.sin((ph-0.18)/0.12*Math.PI) * 0.18;
    else v = 0;
    v += (Math.random()-0.5)*0.03;
    ecgData[ecgHead] = v;
    ecgHead = (ecgHead+1) % ecgData.length;
  }
  ecgCtx.clearRect(0,0,w,h);
  ecgCtx.strokeStyle = 'rgba(111,191,168,0.9)';
  ecgCtx.lineWidth = 2;
  ecgCtx.beginPath();
  for(var k=0;k<ecgData.length;k++){
    var val = ecgData[(ecgHead+k) % ecgData.length];
    var px = k/(ecgData.length-1)*w;
    var py = h*0.55 - val*h*0.42;
    if(k===0) ecgCtx.moveTo(px,py); else ecgCtx.lineTo(px,py);
  }
  ecgCtx.stroke();
}

// --- 探知レーダー ------------------------------------------------------
var radarEl = $('radar'), radarCtx = radarEl.getContext('2d'), radarSweep = 0;

function positionRadar(){
  var v = $('vitals').getBoundingClientRect();
  radarEl.style.top = (v.bottom + 10) + 'px';
}
window.addEventListener('resize', function(){ if(!radarEl.hidden) positionRadar(); });

function drawRadar(/** @type {number} */ dt){
  var mode = detectMode();
  if(mode === 0 || state !== STATE.PLAY){
    if(!radarEl.hidden) radarEl.hidden = true;
    return;
  }
  if(radarEl.hidden){ radarEl.hidden = false; positionRadar(); }

  var g = radarCtx, S = radarEl.width, cx = S/2, cy = S/2, R = S/2 - 10;
  var range = 46;
  g.clearRect(0,0,S,S);

  // 距離リングと十字
  g.strokeStyle = 'rgba(111,191,168,0.20)'; g.lineWidth = 1.5;
  [0.34,0.67,1].forEach(function(f){ g.beginPath(); g.arc(cx,cy,R*f,0,TAU); g.stroke(); });
  g.beginPath();
  g.moveTo(cx, cy-R); g.lineTo(cx, cy+R);
  g.moveTo(cx-R, cy); g.lineTo(cx+R, cy);
  g.stroke();

  // 走査線
  radarSweep = (radarSweep + dt*1.9) % TAU;
  var sg = g.createLinearGradient(cx, cy, cx + Math.sin(radarSweep)*R, cy - Math.cos(radarSweep)*R);
  sg.addColorStop(0, 'rgba(111,191,168,0.55)');
  sg.addColorStop(1, 'rgba(111,191,168,0)');
  g.strokeStyle = sg; g.lineWidth = 2;
  g.beginPath(); g.moveTo(cx,cy);
  g.lineTo(cx + Math.sin(radarSweep)*R, cy - Math.cos(radarSweep)*R); g.stroke();

  var sy = Math.sin(player.viewYaw), cyw = Math.cos(player.viewYaw);
  var fx = -sy, fz = -cyw, rx = cyw, rz = -sy;
  function project(/** @type {any} */ wx, /** @type {any} */ wz){
    var dx = wx - player.x, dz = wz - player.z;
    var px = dx*rx + dz*rz, pu = dx*fx + dz*fz;
    var d = Math.sqrt(px*px + pu*pu);
    var k = (d > range && d > 0) ? range/d : 1;
    return { x: cx + px*k/range*R, y: cy - pu*k/range*R, d:d, edge:(d > range) };
  }
  function dot(/** @type {any} */ p, /** @type {any} */ color, /** @type {any} */ r, /** @type {any} */ ring){
    g.fillStyle = color;
    g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
    if(ring){
      g.strokeStyle = color; g.lineWidth = 1.5;
      g.beginPath(); g.arc(p.x, p.y, r + 3 + ring*5, 0, TAU); g.stroke();
    }
  }

  // 完全探知：目標物も表示
  if(mode === 2){
    for(var i=0;i<world.records.length;i++){
      var rc = world.records[i]; if(rc.taken) continue;
      dot(project(rc.x, rc.z), 'rgba(111,191,168,0.95)', 3.5, 0);
    }
    for(var j=0;j<world.batteries.length;j++){
      var bt = world.batteries[j]; if(bt.taken) continue;
      dot(project(bt.x, bt.z), 'rgba(232,163,61,0.9)', 2.6, 0);
    }
    if(world.exit){
      var ep = project(world.exit.doorX, world.exit.doorZ);
      g.fillStyle = world.exit.open ? 'rgba(140,255,210,0.95)' : 'rgba(140,38,38,0.9)';
      g.fillRect(ep.x-3.5, ep.y-3.5, 7, 7);
    }
  }

  // 追跡者
  if(hunter.group && hunter.group.visible){
    var hp2 = project(hunter.x, hunter.z);
    var col = hunter.mode === 'chase' ? 'rgba(255,77,61,0.95)'
            : (hunter.mode === 'hunt' ? 'rgba(232,163,61,0.95)' : 'rgba(200,205,196,0.75)');
    var pulse = hunter.mode === 'chase' ? (0.5 + 0.5*Math.sin(performance.now()*0.012)) : 0;
    dot(hp2, col, hp2.edge ? 3.2 : 4.6, pulse);
    // 距離表示
    g.fillStyle = col;
    g.font = '600 20px ui-monospace, monospace';
    g.textAlign = 'center';
    g.fillText(Math.round(hp2.d) + 'm', cx, S - 8);
  }

  // 自機（常に上を向く）
  g.fillStyle = 'rgba(232,226,212,0.92)';
  g.beginPath();
  g.moveTo(cx, cy-7); g.lineTo(cx-5, cy+5); g.lineTo(cx+5, cy+5);
  g.closePath(); g.fill();
}


/* 音の方向表示（設計指示書 第 13 章）。追跡者の足音と声が「どちらから」
   聞こえたかを画面の縁の弧と短い字幕で出す。距離は言葉で粗くだけ伝える
   （正確な距離を出すと音より強い手掛かりになってしまう）。 */
var CUE = { t:0 };
function soundCue(/** @type {any} */ label, /** @type {number} */ dist, /** @type {any} */ hot){
  if(!settings.cues || state !== STATE.PLAY) return;
  var dx = hunter.x - player.x, dz = hunter.z - player.z;
  var fx = -Math.sin(player.viewYaw), fz = -Math.cos(player.viewYaw);
  var rx =  Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  var ang = Math.atan2(dx*rx + dz*rz, dx*fx + dz*fz) * 180/Math.PI;   // 0 = 正面, 90 = 右
  var a4 = (ang + 360 + 45) % 360;
  var dir = a4 < 90 ? '前' : (a4 < 180 ? '右' : (a4 < 270 ? '後ろ' : '左'));
  var far = dist < 8 ? '近い' : (dist < 16 ? '' : '遠い');
  var el = $('cue');
  el.style.setProperty('--a', ang.toFixed(0) + 'deg');
  el.querySelector('span').textContent = '［' + label + '・' + dir + (far ? '・' + far : '') + '］';
  el.classList.toggle('hot', !!hot);
  el.classList.add('on');
  CUE.t = 1.2;
}
function updateCue(/** @type {number} */ dt){
  if(CUE.t <= 0) return;
  CUE.t -= dt;
  if(CUE.t <= 0 || state !== STATE.PLAY) $('cue').classList.remove('on');
}

/* --- 手帳の画面 --------------------------------------------------------
   所見・書き置き・通達・私信の 4 つの声で並べる。未読は題だけ伏せて出す
   （あと何があるかは分かるが、何が書いてあるかは分からない）。
   私信は指で選べる。妹に宛てた声の 3 通を選び揃えると、結びつく。 */
var journalReturn = 'title', jSel = /** @type {Object<string, any>} */ ({});
function noteVoice(/** @type {any} */ head){
  if(head.indexOf('所見') === 0) return 0;
  if(head.indexOf('書き置き') === 0) return 1;
  return 2;                                   // 通達・配線記録
}
function openJournal(/** @type {any} */ from){
  journalReturn = from || 'title';
  jSel = {};
  renderJournal();
  showPanel('journal');
}
function renderJournal(){
  var list = $('jList'); list.innerHTML = '';
  var VOICES = ['所見 — 夜勤の看護記録', '書き置き — 患者の残したもの', '通達・記録 — 院長名義'];
  var readN = 0;
  for(var v=0; v<3; v++){
    var sec = document.createElement('div'); sec.className = 'jsec'; sec.textContent = VOICES[v];
    list.appendChild(sec);
    for(var i=0; i<NOTES.length; i++){
      if(noteVoice(NOTES[i][0]) !== v) continue;
      var el = document.createElement('div');
      var rd = !!JOURNAL.notes[i]; if(rd) readN++;
      el.className = 'jdoc' + (rd ? '' : ' unread');
      el.innerHTML = '<b></b><span></span>';
      el.firstChild.textContent = rd ? NOTES[i][0] : '（未読）';
      el.lastChild.textContent = rd ? NOTES[i][1] : '';
      list.appendChild(el);
    }
  }
  var sec2 = document.createElement('div'); sec2.className = 'jsec'; sec2.textContent = '私信 — 同じ筆跡で';
  list.appendChild(sec2);
  var lr = lettersRead();
  LETTERS.forEach(function(L, li){
    var el = document.createElement('div');
    var rd = !!JOURNAL.letters[li];
    var linked = JOURNAL.linked && LETTER_SISTER.indexOf(li) >= 0;
    el.className = 'jdoc' + (rd ? ' letter' : ' unread') + (jSel[li] ? ' sel' : '') + (linked ? ' linked' : '');
    el.innerHTML = '<b></b><span></span>';
    el.firstChild.textContent = rd ? L[0] + (linked ? '　— 結びついた' : '') : '（未読）';
    el.lastChild.textContent = rd ? L[1] : '';
    if(rd && !JOURNAL.linked && lr === LETTERS.length){
      el.addEventListener('click', function(){ jSel[li] = !jSel[li]; tryLink(); renderJournal(); });
    }
    list.appendChild(el);
  });
  $('jSummary').textContent = '読んだ記録 ' + readN + ' / ' + NOTES.length + '　私信 ' + lr + ' / ' + LETTERS.length +
    (JOURNAL.endings.A ? '　· 脱出の結末を見た' : '') + (JOURNAL.endings.B ? '　· もう一つの結末を見た' : '');
  var hint;
  if(JOURNAL.linked) hint = '三通の私信は、同じ一人の声を追っていた。最後の扉の前で、灯りを消す。';
  else if(lr === LETTERS.length) hint = '私信を読み比べ、同じことを語っている三通を選ぶ。';
  else hint = '私信はまだ揃っていない。一度の脱出行で一通ずつ見つかる。';
  $('jLinkHint').textContent = hint;
}
function tryLink(){
  var picked = /** @type {any[]} */ ([]);
  for(var k in jSel) if(jSel[k]) picked.push(+k);
  if(picked.length < 3) return;
  var ok = picked.length === 3 && LETTER_SISTER.every(function(x){ return picked.indexOf(x) >= 0; });
  if(ok){
    JOURNAL.linked = true; saveJournal();
    Audio2.unlock();
  }else{
    Audio2.click(false);
  }
  jSel = {};
}

/* --- 迷ったときのほのめかし（設計指示書 第 11.3 節） ---------------------
   何も進まないまま 3 分経ったら、次に向かうべき物がある区画を言う。
   さらに 2 分経ったら、今の向きから見た大まかな方角も添える。
   進んだ（拾った・開けた）瞬間に数え直す。地図の代わりにはしない
   （正確な位置は出さない。迷っている人を少し押すだけ）。 */
var HINT_T1 = 180, HINT_T2 = 300;
var HINT = { idle:0, level:0, lastGot:-1, lastKey:false };
function resetHint(){ HINT.idle = 0; HINT.level = 0; HINT.lastGot = -1; HINT.lastKey = false; }
/** @return {any} */
function hintTarget(){
  var best = null, bd = 1e9;
  function consider(/** @type {any} */ o, /** @type {any} */ what){
    var dx = o.x - player.x, dz = o.z - player.z, dd = dx*dx + dz*dz;
    if(dd < bd){ bd = dd; best = { x:o.x, z:o.z, what:what }; }
  }
  if(player.got < player.need){
    world.records.forEach(function(/** @type {any} */ r){ if(!r.taken) consider(r, 'カルテ'); });
  }else if(world.key && !world.key.taken && !player.hasKey){
    consider(world.key, '鍵');
  }else if(world.exit){
    consider({ x:world.exit.doorX, z:world.exit.doorZ }, '非常口');
  }
  return best;
}
function updateHint(/** @type {number} */ dt){
  if(BOT.on || playAs === 'hunter') return;
  if(player.got !== HINT.lastGot || player.hasKey !== HINT.lastKey){
    HINT.lastGot = player.got; HINT.lastKey = player.hasKey;
    HINT.idle = 0; HINT.level = 0;
    return;
  }
  if(player.hiding) return;                      // 隠れて様子を見ている時間は数えない
  HINT.idle += dt;
  var want = HINT.idle > HINT_T2 ? 2 : (HINT.idle > HINT_T1 ? 1 : 0);
  if(want <= HINT.level) return;
  HINT.level = want;
  var t = hintTarget(); if(!t) return;
  var c = worldToCell(t.x, t.z);
  var msg = t.what + 'は区画 ' + ZONE_LETTERS[zoneOf(c.x, c.y)] + ' のあたりにあった気がする';
  if(want >= 2){
    var dx = t.x - player.x, dz = t.z - player.z;
    var fx = -Math.sin(player.viewYaw), fz = -Math.cos(player.viewYaw);
    var rx =  Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
    var a = Math.atan2(dx*rx + dz*rz, dx*fx + dz*fz) * 180/Math.PI;
    var a4 = (a + 360 + 45) % 360;
    msg += '。' + (a4 < 90 ? '前の方' : (a4 < 180 ? '右手の方' : (a4 < 270 ? '後ろの方' : '左手の方')));
  }
  toast(msg, 5);
  $('objSub').textContent = msg;
}

/* --- 地図（設計指示書 第 11.3 節） ---------------------------------------
   歩いた場所だけが描かれる手描きの地図。一時停止で見る。
   載るのは：歩いた通路、区画の記号、見たことのある非常口、自分の位置と向き。
   カルテや鍵は載せない（覚えていれば描ける、という以上のことは教えない）。 */
var MAPV = { exitSeen:false };
function resetMap(){ world.visited = new Uint8Array(GW*GH); MAPV.exitSeen = false; }
function markVisited(){
  if(!world.visited) return;
  var c = worldToCell(player.x, player.z), g = world.grid;
  for(var oy=-1; oy<=1; oy++) for(var ox=-1; ox<=1; ox++){
    var x = c.x + ox, y = c.y + oy;
    if(inBounds(x, y) && g[idx(x, y)] === 0) world.visited[idx(x, y)] = 1;
  }
  if(!MAPV.exitSeen && world.exit){
    var dx = world.exit.doorX - player.x, dz = world.exit.doorZ - player.z;
    if(dx*dx + dz*dz < 144 && hasSight(g, player.x, player.z, world.exit.doorX, world.exit.doorZ)) MAPV.exitSeen = true;
  }
}
function drawMap(){
  var cv = $('pauseMap'); if(!cv || !world.visited) return;
  var x = cv.getContext('2d'), S = cv.width, g = world.grid;
  var cs = S / (GW + 2), o = cs;               // 1 マスの大きさと余白
  // 紙
  x.fillStyle = '#d9d0bb'; x.fillRect(0, 0, S, S);
  var hs = 0;
  function jr(){ hs = (hs * 9301 + 49297) % 233280; return hs / 233280 - 0.5; }   // 描くたびに同じ揺れ
  for(var k=0; k<900; k++){ x.fillStyle = 'rgba(90,70,40,' + (0.03 + (jr()+0.5)*0.05).toFixed(3) + ')';
    x.fillRect((jr()+0.5)*S, (jr()+0.5)*S, 2 + (jr()+0.5)*5, 1 + (jr()+0.5)*2); }
  // 歩いた床を淡く塗る
  // 1 本の経路にまとめて一度に塗る（半透明を 1 マスずつ重ねると継ぎ目が濃く出た）
  x.fillStyle = 'rgba(120,100,70,0.16)'; x.beginPath();
  for(var y=0; y<GH; y++) for(var xx=0; xx<GW; xx++)
    if(world.visited[idx(xx, y)]) x.rect(o + xx*cs, o + y*cs, cs + 0.5, cs + 0.5);
  x.fill('nonzero');
  // 壁の線。歩いた床と壁の境目だけを、少し揺らしながら引く
  x.strokeStyle = 'rgba(40,32,26,0.85)'; x.lineWidth = Math.max(1.4, cs*0.14); x.lineCap = 'round';
  x.beginPath();
  for(var y2=0; y2<GH; y2++) for(var x2=0; x2<GW; x2++){
    if(!world.visited[idx(x2, y2)]) continue;
    var px = o + x2*cs, py = o + y2*cs, j = cs*0.08;
    [[0,-1, px,py, px+cs,py], [0,1, px,py+cs, px+cs,py+cs], [-1,0, px,py, px,py+cs], [1,0, px+cs,py, px+cs,py+cs]]
    .forEach(function(e){
      var nx = x2 + e[0], ny = y2 + e[1];
      if(inBounds(nx, ny) && g[idx(nx, ny)] === 0) return;
      x.moveTo(e[2] + jr()*j, e[3] + jr()*j); x.lineTo(e[4] + jr()*j, e[5] + jr()*j);
    });
  }
  x.stroke();
  // 区画の記号（その区画を少しでも歩いたら）
  x.fillStyle = 'rgba(40,32,26,0.55)'; x.font = 'bold ' + Math.round(cs*2.2) + 'px ' + getComputedStyle(document.body).fontFamily;
  x.textAlign = 'center'; x.textBaseline = 'middle';
  for(var zy=0; zy<3; zy++) for(var zx=0; zx<3; zx++){
    var seen = false, x0 = Math.floor(zx*GW/3), x1 = Math.floor((zx+1)*GW/3), y0 = Math.floor(zy*GH/3), y1 = Math.floor((zy+1)*GH/3);
    for(var yy=y0; yy<y1 && !seen; yy++) for(var xz=x0; xz<x1 && !seen; xz++) if(world.visited[idx(xz, yy)]) seen = true;
    if(seen) x.fillText(ZONE_LETTERS[zy*3 + zx], o + (x0+x1)/2*cs, o + (y0+y1)/2*cs);
  }
  // 非常口（見たことがあれば）
  function w2m(/** @type {any} */ wx, /** @type {any} */ wz){
    var fx = (wx / CELL + (GW-1)/2), fz = (wz / CELL + (GH-1)/2);
    return { x:o + (fx + 0.5)*cs, y:o + (fz + 0.5)*cs }; }
  if(MAPV.exitSeen && world.exit){
    var e = w2m(world.exit.doorX, world.exit.doorZ);
    x.strokeStyle = '#8c2626'; x.lineWidth = 2.2; x.beginPath();
    x.moveTo(e.x - cs*0.7, e.y - cs*0.7); x.lineTo(e.x + cs*0.7, e.y + cs*0.7);
    x.moveTo(e.x + cs*0.7, e.y - cs*0.7); x.lineTo(e.x - cs*0.7, e.y + cs*0.7); x.stroke();
    x.fillStyle = '#8c2626'; x.font = Math.round(cs*1.1) + 'px sans-serif'; x.fillText('EXIT', e.x, e.y - cs*1.3);
  }
  // 自分：向きの付いた三角
  var me = w2m(player.x, player.z), a = player.yaw;
  var fx2 = -Math.sin(a), fz2 = -Math.cos(a), r = cs*0.9;
  x.fillStyle = '#1d2a26'; x.beginPath();
  x.moveTo(me.x + fx2*r*1.3, me.y + fz2*r*1.3);
  x.lineTo(me.x - fz2*r*0.7 - fx2*r*0.6, me.y + fx2*r*0.7 - fz2*r*0.6);
  x.lineTo(me.x + fz2*r*0.7 - fx2*r*0.6, me.y - fx2*r*0.7 - fz2*r*0.6);
  x.closePath(); x.fill();
}

/* --- プレイテストの記録（設計指示書 第 17 章） -----------------------------
   設定でオンにしたときだけ、この端末の中（Store）に残す。外へは一切送らない。
   目的は二つ：捕まる場所が偏っていないか（理不尽の検出）と、どこでやめてしまうか。
   記録するもの：章の開始と終わり（結果・時間）、捕まった場所と相手、隠れ場所に入った場所、
   1 分ごとのフレーム時間の分布（中央値・95%）と温度の段階。 */
var TELE = { ev:/** @type {any} */ (null), ft:/** @type {any[]} */ ([]), ftT:0 };
var TELE_MAX = 3000;
function teleLoad(){
  if(TELE.ev) return;
  try{ TELE.ev = JSON.parse(Store.get('ward7.tele') || '[]'); }catch(e){ TELE.ev = []; }
  if(!Array.isArray(TELE.ev)) TELE.ev = [];
}
function tele(/** @type {any} */ kind, /** @type {any} */ data){
  if(!settings.tele || BOT.on) return;
  teleLoad();
  var e = /** @type {Object<string, any>} */ ({ k:kind, t:Math.round(Date.now()/1000), ch:runDef().n, d:settings.diff|0 });
  for(var key in data) e[key] = data[key];
  TELE.ev.push(e);
  if(TELE.ev.length > TELE_MAX) TELE.ev.splice(0, TELE.ev.length - TELE_MAX);
  Store.set('ward7.tele', JSON.stringify(TELE.ev));
}
function teleFrame(/** @type {number} */ dt){
  if(!settings.tele || BOT.on || state !== STATE.PLAY) return;
  TELE.ft.push(dt); TELE.ftT += dt;
  if(TELE.ftT < 60) return;
  var a = TELE.ft.slice().sort(function(x, y){ return x - y; });
  tele('frames', { med:+(a[a.length >> 1]*1000).toFixed(1), p95:+(a[Math.floor(a.length*0.95)]*1000).toFixed(1),
                   n:a.length, drs:+DRS.scale.toFixed(2), heat:THERMAL.level, q:settings.quality|0 });
  TELE.ft = []; TELE.ftT = 0;
}
function teleExport(){
  teleLoad();
  var text = JSON.stringify({ app:'ward7', at:new Date().toISOString(), ua:navigator.userAgent, events:TELE.ev }, null, 1);
  // iOS アプリでは保存のダイアログが出ないので、共有シートかクリップボードへ
  try{
    var blob = new Blob([text], { type:'application/json' });
    var file = (typeof File === 'function') ? new File([blob], 'ward7-playtest.json', { type:'application/json' }) : null;
    if(file && navigator.canShare && navigator.canShare({ files:[file] })){ navigator.share({ files:[file] }).catch(function(){}); return; }
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'ward7-playtest.json';
    document.body.appendChild(a); a.click(); setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }catch(e){
    try{ navigator.clipboard.writeText(text); toast('記録をクリップボードに写した', 2.4); }catch(e2){}
  }
}

/* ---- その場の操作説明（設計指示書 第 11.4 節） ----
   最初から一覧を見せず、その操作が要る場面に初めて来たときに 1 度だけ出す。
   出した物は端末に控え、周回しても繰り返さない。表示は使っている入力機器に合わせる
   （キーは割り当てを引く）。追われている間は「走れ」以外を出さない。 */
var TIPS = { seen:/** @type {Object<string, any>} */ ({}), cool:0, still:0 };
try{ TIPS.seen = JSON.parse(Store.get('ward7.tips') || '{}') || {}; }catch(e){ TIPS.seen = {}; }
var PAD_NAME = /** @type {Object<string, any>} */ ({ use:'A', lamp:'X', throw:'RB', peek:'R3', run:'RT', sneak:'LT', look:'LB', hold:'B' });
function tipKey(/** @type {any} */ a){
  var ja = LANG !== 'en';
  if(lastInputKind === 'pad') return PAD_NAME[a];
  if(lastInputKind === 'touch'){
    return (/** @type {Object<string, any>} */ ({ use: ja ? '右下のボタン' : 'the bottom-right button', lamp:'LAMP',
              throw: ja ? '「投げる」' : '“Throw”', peek: ja ? '「覗く」' : '“Peek”',
              run: ja ? 'スティックを大きく倒して' : 'Push the stick all the way',
              look: ja ? '「後ろを見る」' : '“Look back”', hold: ja ? '「息を止める」' : '“Hold breath”' }))[a];
  }
  return keyLabel(keyOf(a === 'hold' ? 'run' : a));
}
function tipShow(/** @type {any} */ id, /** @type {any} */ ja, /** @type {any} */ en){
  if(TIPS.seen[id] || BOT.on || playAs === 'hunter' || TIPS.cool > 0) return false;
  TIPS.seen[id] = 1; TIPS.cool = 7;
  try{ Store.set('ward7.tips', JSON.stringify(TIPS.seen)); }catch(e){}
  toast(LANG === 'en' ? en : ja, 4.8);
  return true;
}
function updateTips(/** @type {number} */ dt){
  if(state !== STATE.PLAY || BOT.on || playAs === 'hunter') return;
  TIPS.cool = Math.max(0, TIPS.cool - dt);
  var k = tipKey, touch = lastInputKind === 'touch', chase = hunter.mode === 'chase';
  if(chase){
    if(touch) tipShow('run', 'スティックを大きく倒して走る。角を曲がって見失わせる', 'Push the stick all the way to run. Break line of sight at corners.');
    else tipShow('run', k('run') + ' を押しながら走る。角を曲がって見失わせる', 'Hold ' + k('run') + ' to run. Break line of sight at corners.');
    return;
  }
  var near = nearestInteractable();
  if(near && near.type === 'hide' && !player.hiding)
    tipShow('hide', k('use') + ' で隠れる', k('use') + ' to hide');
  if(near && near.type === 'record')
    tipShow('record', k('use') + ' でカルテを拾う', k('use') + ' to pick up the record');
  if(near && near.type === 'lock' && player.hasKey)
    tipShow('door', '止まって開けると静か。走ったまま開けると響いて、あれを呼ぶ', 'Stop to ease the door open quietly. Barging through while running is loud.');
  var hd = Math.sqrt((hunter.x-player.x)*(hunter.x-player.x) + (hunter.z-player.z)*(hunter.z-player.z));
  if(player.hiding && hd < 12)
    tipShow('hold', k('hold') + ' を押している間、息を止める（長くは続かない）', 'Hold ' + k('hold') + ' to hold your breath (not for long).');
  if(player.bottles > 0)
    tipShow('throw', k('throw') + ' で瓶を投げる。割れた音の方へ、あれが向かう', k('throw') + ' to throw a bottle. It goes where the glass breaks.');
  if(player.lamp && player.time > 30 && RUN.ch === 0)
    tipShow('lamp', k('lamp') + ' でランプを消せる。灯りは遠くからでも見える', k('lamp') + ' turns the lamp off. Its light can be seen from far away.');
  if(!touch && hunter.mode === 'hunt' && hd < 18)
    tipShow('sneak', k('sneak') + ' を押しながら歩くと忍び足（足音が小さい）', 'Hold ' + k('sneak') + ' to sneak (quieter steps).');
  var still = Math.sqrt(player.vx*player.vx + player.vz*player.vz) < 0.2;
  TIPS.still = still ? TIPS.still + dt : 0;
  if(TIPS.still > 2 && !player.hiding && player.time > 60 && peekSide() !== 0)
    tipShow('peek', k('peek') + ' で角から覗く', k('peek') + ' to peek around the corner');
}

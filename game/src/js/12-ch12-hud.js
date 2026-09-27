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
var JOURNAL = { notes:{}, letters:{}, linked:false, endings:{} };
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
function buildNoteOrder(need){
  var pool = [];
  for(var i=0;i<NOTES.length;i++) if(i !== NOTE_LAST) pool.push(i);
  for(var j=pool.length-1; j>0; j--){          // Fisher-Yates
    var k = (rnd() * (j+1)) | 0;
    var tmp = pool[j]; pool[j] = pool[k]; pool[k] = tmp;
  }
  var out = pool.slice(0, Math.max(0, need-1));
  out.push(NOTE_LAST);
  return out;
}
function showNote(i){
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

function toast(msg, dur){
  var t = $('toast');
  t.textContent = msg;
  t.classList.add('on');
  toastT = dur || 2;
}
function updateBar(id, v){
  var el = $(id).firstElementChild;
  el.style.transform = 'scaleX(' + clamp(v,0,1).toFixed(3) + ')';
}
function drawECG(dt, bpm){
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

function drawRadar(dt){
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
  function project(wx, wz){
    var dx = wx - player.x, dz = wz - player.z;
    var px = dx*rx + dz*rz, pu = dx*fx + dz*fz;
    var d = Math.sqrt(px*px + pu*pu);
    var k = (d > range && d > 0) ? range/d : 1;
    return { x: cx + px*k/range*R, y: cy - pu*k/range*R, d:d, edge:(d > range) };
  }
  function dot(p, color, r, ring){
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
function soundCue(label, dist, hot){
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
function updateCue(dt){
  if(CUE.t <= 0) return;
  CUE.t -= dt;
  if(CUE.t <= 0 || state !== STATE.PLAY) $('cue').classList.remove('on');
}

/* --- 手帳の画面 --------------------------------------------------------
   所見・書き置き・通達・私信の 4 つの声で並べる。未読は題だけ伏せて出す
   （あと何があるかは分かるが、何が書いてあるかは分からない）。
   私信は指で選べる。妹に宛てた声の 3 通を選び揃えると、結びつく。 */
var journalReturn = 'title', jSel = {};
function noteVoice(head){
  if(head.indexOf('所見') === 0) return 0;
  if(head.indexOf('書き置き') === 0) return 1;
  return 2;                                   // 通達・配線記録
}
function openJournal(from){
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
  var picked = [];
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

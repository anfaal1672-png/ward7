/* =========================================================================
   5. 設定・状態
   ========================================================================= */
/* learn … 同じ隠れ場所を何回使うと、見失った近くでそこを点検しに来るか
   calm  … 何秒出会わずにいると、演出の頭脳が徘徊をこちらの近くへ寄せるか
   （設計指示書 第 5.3 節） */
var DIFF = [
  // chaseMul を掛けた値が追跡速度。プレイヤーの全力疾走は約5.8m/s
  // ※ プレイヤーの基準速度と合わせて全体を1.22倍してあるので、速さの比＝難易度は据え置き
  { key:'静穏',  records:4, hunterSpeed:3.111, sight:16, hearing:10, drain:1.05, dmg:26, batteries:6,
    chaseMul:1.32, rage:0.366, memory:1.8, batteries2:2,
    learn:4, calm:90 },
  { key:'通常',  records:5, hunterSpeed:3.721, sight:20, hearing:13, drain:1.5,  dmg:38, batteries:5,
    chaseMul:1.32, rage:0.488, memory:2.4, batteries2:2,
    learn:3, calm:65 },
  { key:'絶望',  records:6, hunterSpeed:4.270, sight:25, hearing:16, drain:2.1,  dmg:52, batteries:4,
    chaseMul:1.34, rage:0.610, memory:3.2, batteries2:2,
    learn:2, calm:45 }
];

/* 章（設計指示書 第 6.2 節）。物語は章ごとに種を固定し、全員が同じ病棟を歩く
   （攻略や実況を共有できるように）。夜勤は毎回違う病棟を歩く周回用の遊び方
   （第 5.7 節）で、これまでのゲームそのもの。
   patients … 壁を向いて立つ患者の数（難易度順）。灯りを向けると叫び、あれを呼ぶ
   blackout … 非常回路が落ちている。非常灯は消え、電源を戻すまで非常口が開かない */
var CHAPTERS = [
  { n:1, name:'西棟',   seed:0x57A01, patients:[0,0,0], blackout:false,
    intro:'カルテを集め、非常口から出る。' },
  { n:2, name:'東棟',   seed:0x57A02, patients:[3,3,5], blackout:false,
    intro:'大部屋の患者たちは壁を向いて立っている。灯りを向けると騒ぐ。騒げば、あれが来る。' },
  { n:3, name:'管理棟', seed:0x57A03, patients:[0,0,2], blackout:true,
    intro:'非常回路が落ちている。電源を戻さなければ非常口は開かない。戻せば、あれに気づかれる。' },
  { n:4, name:'階段',   seed:0x57A04, patients:[0,1,1], blackout:false, vents:6,
    intro:'天井裏を何かが這っている。音のした方へ、上から先回りしてくる。' },
  { n:5, name:'記録庫', seed:0x57A05, patients:[0,0,1], blackout:false, reflect:true,
    intro:'灯りの外でだけ近づいてくるものがいる。照らせば止まり、照らし続ければ消える。' },
  { n:6, name:'地下', seed:0x57A06, patients:[0,0,2], blackout:false, water:true,
    intro:'地下は膝まで水が溜まっている。水の中では自分の足音が響き、あれの足音は水音に紛れる。' },
  /* 終章。第1章と同じ種＝同じ間取り。最初に歩いた病棟へ戻ってくる
     （最後のカルテ「出口の場所が思い出せない」に、歩いた記憶で答える章） */
  { n:7, name:'第七病棟', seed:0x57A01, patients:[2,2,3], blackout:false, vents:3, reflect:true,
    intro:'最初の病棟に戻ってきた。出口の場所を思い出す。ここを抜けたところで、すべてが終わる。' }
];
/* 夜勤の種は日付から作る（設計指示書 第 5.7 節「日替わりの種」）。
   同じ日なら誰が遊んでも同じ病棟。日が変われば別の病棟 */
var NIGHT = { n:0, name:'夜勤', seed:/** @type {any} */ (null), patients:[2,2,3], blackout:false,
  intro:'日替わりの病棟。今日の夜勤は、今日だけ。' };
function nightSeed(){
  var d = new Date(), k = d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate();
  return ((k * 2654435761) ^ 0x57A7) >>> 0;
}
/* いま遊んでいる回。RUN.ch は CHAPTERS の添字、夜勤は -1 */
var RUN = { ch:0 };
function runDef(){ return RUN.ch >= 0 ? CHAPTERS[RUN.ch] : NIGHT; }
function isFinalChapter(){ return RUN.ch === CHAPTERS.length - 1; }
/* 章の進み。どこまで開いたか・どれを抜けたか */
var PROGRESS = { unlocked:1, cleared:/** @type {Object<string, any>} */ ({}) };
try{
  var pg0 = JSON.parse(Store.get('ward7.progress') || 'null');
  if(pg0 && typeof pg0 === 'object'){
    PROGRESS.unlocked = clamp(pg0.unlocked|0, 1, CHAPTERS.length);
    if(pg0.cleared && typeof pg0.cleared === 'object') PROGRESS.cleared = pg0.cleared;
  }
}catch(e){}
function saveProgress(){ Store.set('ward7.progress', JSON.stringify(PROGRESS)); }
RUN.ch = clamp(PROGRESS.unlocked - 1, 0, CHAPTERS.length - 1);

/* どちらの側で遊ぶか。'survivor' が従来のゲーム、'hunter' は追う側。
   追う側のときは逃げる側を AI（第19章のボット）が動かす。 */
var playAs = 'survivor';

/** @type {Object<string, any>} */
var settings = {
  quality: 1,      // 0 軽量 / 1 標準 / 2 高精細
  sens: 1.0,
  vol: 0.7,
  invert: false,
  diff: 1,
  detect: 0,       // 0 オフ / 1 敵のみ / 2 完全探知
  gamma: 1.0,      // 画面の明るさ
  // アクセシビリティ（設計指示書 第 13 章）
  fov: 0,          // 視野角の上乗せ（度）
  motion: 1.0,     // 画面の揺れ 0..1
  flash: 1.0,      // 点滅の強さ 0..1
  cues: false,     // 音の方向表示
  lang: LANG,      // 'ja' / 'en'（第 1b 章。端末の言語が既定）
  hrtf: true,      // 立体音響：ヘッドホン（HRTF）/ スピーカー（左右だけ）
  tele: false,     // プレイテストの記録（端末の中だけ。第 17 章）
  safeHide: false, // 恐怖の調整：隠れ場所は安全（点検されない・入るのを見られても引き出されない）
  softScare: false,// 恐怖の調整：叫び・金切り声を弱める
  lefty: false,    // 左手持ち：スティックとボタンの左右を入れ替える
  // 画面効果を 1 つずつ切れるように（設計指示書 第 8.2 節の末尾・第 13 章）
  fxBeam: true,    // ランプの光の筋（空気中の埃に散る光）
  fxAO: true,      // 接地の陰（最高品質のみ）
  fxAA: true,      // 輪郭のぎざぎざを均す（FXAA）
  fxDof: true,     // 書類を読む間、奥をぼかす
  haptics: true,   // 振動（iOS アプリの触覚。心拍・近づく足音・掴まれた瞬間）
  keys: {},        // キーの割り当て（第 12.3 節）。操作名 → KeyboardEvent.code。空なら既定
  btnPos: {}       // タッチのボタンの配置（第 12.1 節）。id → { x, y }（画面に対する中心の割合）
};
try{
  var saved = JSON.parse(Store.get('ward7.settings') || 'null');
  if(saved && typeof saved === 'object'){
    if(typeof saved.quality==='number') settings.quality = clamp(saved.quality|0,0,3);
    if(typeof saved.sens==='number')    settings.sens = clamp(saved.sens,0.3,2.5);
    if(typeof saved.vol==='number')     settings.vol = clamp(saved.vol,0,1);
    if(typeof saved.invert==='boolean') settings.invert = saved.invert;
    if(typeof saved.diff==='number')    settings.diff = clamp(saved.diff|0,0,2);
    if(typeof saved.detect==='number')  settings.detect = clamp(saved.detect|0,0,2);
    if(typeof saved.gamma==='number')   settings.gamma = clamp(saved.gamma,0.6,1.9);
    if(typeof saved.fov==='number')     settings.fov = clamp(saved.fov|0,-10,20);
    if(typeof saved.motion==='number')  settings.motion = clamp(saved.motion,0,1);
    if(typeof saved.flash==='number')   settings.flash = clamp(saved.flash,0,1);
    if(typeof saved.cues==='boolean')   settings.cues = saved.cues;
    if(saved.lang === 'ja' || saved.lang === 'en') settings.lang = saved.lang;
    if(typeof saved.hrtf==='boolean')   settings.hrtf = saved.hrtf;
    if(typeof saved.tele==='boolean')   settings.tele = saved.tele;
    if(saved.btnPos && typeof saved.btnPos === 'object'){
      Object.keys(saved.btnPos).forEach(function(k){ var v = saved.btnPos[k];
        if(v && isFinite(v.x) && isFinite(v.y)) settings.btnPos[k] = { x:clamp(+v.x, 0.03, 0.97), y:clamp(+v.y, 0.03, 0.97) }; });
    }
    if(saved.keys && typeof saved.keys === 'object'){
      Object.keys(saved.keys).forEach(function(k){ if(typeof saved.keys[k] === 'string' && /^[A-Za-z0-9]+$/.test(saved.keys[k])) settings.keys[k] = saved.keys[k]; });
    }
    ['safeHide','softScare','lefty','fxBeam','fxAO','fxAA','fxDof','haptics'].forEach(function(k){ if(typeof saved[k]==='boolean') settings[k] = saved[k]; });
  }
}catch(e){}
/* 遊んだ記録。難易度ごとに、挑戦した回数・脱出した回数・最速の脱出・
   無傷で脱出したか、を残す。次に何を狙うかが自分で決められるようになる。
   保存できない環境（プライベートモード等）では黙って諦める——
   記録が残らないだけで遊べなくなるものではない。 */
var RECS = /** @type {any[]} */ ([null, null, null]);
function blankRec(){ return { runs:0, wins:0, best:0, noHit:false, most:0 }; }
try{
  var rr = JSON.parse(Store.get('ward7.recs') || 'null');
  for(var ri2=0; ri2<3; ri2++){
    var r0 = (rr && rr[ri2]) ? rr[ri2] : blankRec();
    RECS[ri2] = {
      runs:  (+r0.runs  || 0), wins: (+r0.wins || 0),
      best:  (+r0.best  || 0), most: (+r0.most || 0),
      noHit: !!r0.noHit
    };
  }
}catch(e){ for(var ri3=0; ri3<3; ri3++) RECS[ri3] = blankRec(); }
function saveRecs(){
  Store.set('ward7.recs', JSON.stringify(RECS));
}
/* 1 回ぶんを記録する。won=脱出したか、hits=被弾回数 */
function recordRun(/** @type {boolean} */ won, /** @type {number} */ hits){
  if(cheatUsed) return;                       // チートを使った回は残さない
  var R = RECS[clamp(settings.diff|0,0,2)];
  R.runs++;
  if(player.got > R.most) R.most = player.got;
  if(won){
    R.wins++;
    if(!R.best || player.time < R.best) R.best = player.time;
    if(hits === 0) R.noHit = true;
  }
  saveRecs();
}
function recLine(/** @type {any} */ d){
  var R = RECS[d];
  if(!R || !R.runs) return '記録なし';
  return '挑戦 ' + R.runs + ' · 脱出 ' + R.wins +
         (R.best ? ' · 最速 ' + fmtTime(R.best) : '') +
         (R.noHit ? ' · 無傷あり' : '');
}

function saveSettings(){
  Store.set('ward7.settings', JSON.stringify(settings));
}

/* 初回起動の画質の決め方（設計指示書 第 8.4 節）。
   deviceMemory・hardwareConcurrency は iOS では返らない・丸められるので当てにならない。
   まずそれで仮に決め、タイトルの情景を 5 秒描いて実測し（BENCH）、重ければ 1 段下げ、
   十分に軽ければ 1 段上げて読み込み直す。読み込み直しは 2 回まで。自動操作
   （テスト・ボット）では測らない。設定で画質を選んだら、以後は自動で変えない */
var BENCH = { on:false, t:0, dts:/** @type {any[]} */ ([]), round:0, up:false };
(function(){
  var b = null;
  try{ b = JSON.parse(Store.get('ward7.bench') || 'null'); }catch(e){}
  var fresh = !Store.get('ward7.settings');
  if(!navigator.webdriver && ((fresh && !b) || (b && !b.done))){
    BENCH.on = true; BENCH.round = b ? (b.round|0) : 0; BENCH.up = !!(b && b.up);
  }
})();
// 端末性能から初期品質を推定（保存値がなければ）
(function(){
  try{ if(Store.get('ward7.settings')) return; }catch(e){}
  var mem = navigator.deviceMemory || 4;
  var cores = navigator.hardwareConcurrency || 4;
  if(mem <= 3 || cores <= 4) settings.quality = 0;
  else if(mem >= 8 && cores >= 8) settings.quality = 2;
})();

/* チート。切り替え式（CHEATS）と、その場で効く一発（CHEAT_ACTS）。
   使った回は記録に残さない（recordRun が cheatUsed を見ている）。
   並び順は「体を守る → 見つからない → 速く動く → 相手を弱める →
   世界を見る → 演出」。多いので節に分けてある。 */
var CHEATS = [
  { g:'身',   k:'godmode',   label:'無敵（ダメージ無効）' },
  { g:'身',   k:'infLamp',   label:'ランプ無限' },
  { g:'身',   k:'infBreath', label:'スタミナ無限' },
  { g:'身',   k:'noSanity',  label:'正気度が減らない' },
  { g:'身',   k:'regen',     label:'体力が自動で回復する' },

  { g:'隠',   k:'invisible', label:'追跡者に見つからない' },
  { g:'隠',   k:'silent',    label:'足音を立てない' },
  { g:'隠',   k:'noLampTell',label:'ランプの光で見つからない' },
  { g:'隠',   k:'ghostHide', label:'どこでも隠れられる（入る所を見られても）' },

  { g:'速',   k:'fast',      label:'移動速度 2倍' },
  { g:'速',   k:'noclip',    label:'壁抜け' },
  { g:'速',   k:'quickHands',label:'拾う・使うが即時' },

  { g:'敵',   k:'freeze',    label:'追跡者を停止' },
  { g:'敵',   k:'slowHunter',label:'追跡者の速度を半分に' },
  { g:'敵',   k:'shortMem',  label:'追跡者がすぐ見失う' },
  { g:'敵',   k:'pacifist',  label:'追跡者が攻撃してこない' },
  { g:'敵',   k:'blindEnd',  label:'終盤でも居場所が漏れない' },

  { g:'眼',   k:'reveal',    label:'常に完全探知' },
  { g:'眼',   k:'markItems', label:'カルテ・鍵・電池が壁越しに光る' },
  { g:'眼',   k:'markHides', label:'隠れ場所が壁越しに光る' },
  { g:'眼',   k:'brightWorld',label:'病棟全体が明るい' },
  { g:'眼',   k:'wideView',  label:'視野を広げる' },

  { g:'他',   k:'slowmo',    label:'スローモーション' },
  { g:'他',   k:'noShake',   label:'画面の揺れと歪みを止める' },
  { g:'他',   k:'showDebug', label:'内部の値を表示' }
];
var CHEAT_ACTS = [
  { k:'records',  label:'カルテを全回収' },
  { k:'heal',     label:'体力とランプを全回復' },
  { k:'warp',     label:'非常口へワープ' },
  { k:'push',     label:'追跡者を引き離す' },
  { k:'key',      label:'鍵を手に入れる' },
  { k:'openDoor', label:'施錠扉を開ける' },
  { k:'stun',     label:'追跡者を 10 秒止める' },
  { k:'teleHunter',label:'追跡者を遠くへ飛ばす' },
  { k:'battery',  label:'電池を全部集める' },
  { k:'mapAll',   label:'地図を全部知る（AI観戦用）' },
  { k:'win',      label:'即座に脱出する' },
  { k:'lose',     label:'即座に力尽きる' }
];
var cheats = /** @type {Object<string, any>} */ ({}), cheatUsed = false;
CHEATS.forEach(function(c){ cheats[c.k] = false; });
try{
  var sc = JSON.parse(Store.get('ward7.cheats') || 'null');
  if(sc && typeof sc === 'object') CHEATS.forEach(function(c){ cheats[c.k] = !!sc[c.k]; });
}catch(e){}
function saveCheats(){ Store.set('ward7.cheats', JSON.stringify(cheats)); }
function anyCheat(){
  for(var i=0;i<CHEATS.length;i++) if(cheats[CHEATS[i].k]) return true;
  return false;
}
function detectMode(){ return cheats.reveal ? 2 : settings.detect; }

var STATE = { BOOT:0, TITLE:1, PLAY:2, PAUSE:3, DEAD:4, WIN:5 };
var state = STATE.BOOT;


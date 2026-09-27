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

/* どちらの側で遊ぶか。'survivor' が従来のゲーム、'hunter' は追う側。
   追う側のときは逃げる側を AI（第19章のボット）が動かす。 */
var playAs = 'survivor';

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
  cues: false      // 音の方向表示
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
  }
}catch(e){}
/* 遊んだ記録。難易度ごとに、挑戦した回数・脱出した回数・最速の脱出・
   無傷で脱出したか、を残す。次に何を狙うかが自分で決められるようになる。
   保存できない環境（プライベートモード等）では黙って諦める——
   記録が残らないだけで遊べなくなるものではない。 */
var RECS = [null, null, null];
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
function recordRun(won, hits){
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
function recLine(d){
  var R = RECS[d];
  if(!R || !R.runs) return '記録なし';
  return '挑戦 ' + R.runs + ' · 脱出 ' + R.wins +
         (R.best ? ' · 最速 ' + fmtTime(R.best) : '') +
         (R.noHit ? ' · 無傷あり' : '');
}

function saveSettings(){
  Store.set('ward7.settings', JSON.stringify(settings));
}

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
var cheats = {}, cheatUsed = false;
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


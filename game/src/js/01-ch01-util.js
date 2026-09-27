/* =========================================================================
   1. ユーティリティ
   ========================================================================= */
var clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
var lerp  = function(a,b,t){ return a+(b-a)*t; };
var TAU = Math.PI*2;
var DEG = Math.PI/180;   // 人体の角度は度で書いたほうが意図が読める

/* 振動。iPhone の Safari は navigator.vibrate を持たず、これまで iPhone では
   一度も震えていなかった。iOS アプリの中では WKWebView からネイティブへ
   渡し、Taptic Engine で鳴らす（ios/Sources/AppDelegate.swift の ward7haptic）。
   pat は ms の数、または [鳴る, 休む, 鳴る, ...] の配列（vibrate と同じ形）。 */
function haptic(pat){
  try{
    var h = window.webkit && window.webkit.messageHandlers &&
            window.webkit.messageHandlers.ward7haptic;
    if(h){ h.postMessage(pat); return; }
    if(navigator.vibrate) navigator.vibrate(pat);
  }catch(e){}
}

/* 画面の自動消灯を止める。暗い廊下で息を殺している間に画面が暗くなり、
   そのまま鍵が掛かるのがいちばん興ざめ。遊んでいる間だけ持つ。
   ページが隠れるとブラウザが勝手に手放すので、戻ったら取り直す。
   iOS アプリでは isIdleTimerDisabled で同じことをしている。 */
var wakeLock = null, wakeWant = false;
function keepAwake(on){
  wakeWant = !!on;
  try{
    if(!on){ if(wakeLock){ wakeLock.release(); wakeLock = null; } return; }
    if(wakeLock || !navigator.wakeLock || document.hidden) return;
    navigator.wakeLock.request('screen').then(function(l){
      wakeLock = l;
      l.addEventListener('release', function(){ if(wakeLock === l) wakeLock = null; });
      if(!wakeWant){ l.release(); }
    }).catch(function(){});
  }catch(e){}
}

function mulberry32(a){
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
var rnd = mulberry32(Date.now() & 0x7fffffff);

var IS_TOUCH = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
if(!IS_TOUCH) document.body.classList.add('notouch');
var DEBUG = /[?&]debug=1/.test(location.search);


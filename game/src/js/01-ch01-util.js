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
/* 保存。localStorage は同期で読めるので起動時の設定読みに向くが、
   Safari は 7 日間サイトを開かないと消すことがある（追跡防止の上限）。
   記録と設定が黙って消えるのを防ぐため、書くたびに IndexedDB へ写しを取り、
   起動時に localStorage が空で写しだけ残っていれば戻して一度だけ読み直す。
   あわせて navigator.storage.persist() で消されにくくしてもらう。
   IndexedDB も使えない環境（プライベートモード等）では黙って諦める。 */
var Store = (function(){
  var DB = 'ward7', OS = 'kv', dbp = null;
  function db(){
    if(dbp) return dbp;
    dbp = new Promise(function(res, rej){
      if(!window.indexedDB){ rej(); return; }
      var rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = function(){ rq.result.createObjectStore(OS); };
      rq.onsuccess = function(){ res(rq.result); };
      rq.onerror = function(){ rej(rq.error); };
    });
    dbp.catch(function(){});
    return dbp;
  }
  function mirror(k, v){
    db().then(function(d){
      var tx = d.transaction(OS, 'readwrite');
      if(v === null) tx.objectStore(OS).delete(k); else tx.objectStore(OS).put(v, k);
    }).catch(function(){});
  }
  function get(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(k, v){
    try{ localStorage.setItem(k, v); }catch(e){}
    mirror(k, v);
  }
  /* 起動時に一度。戻したものがあれば true で done を呼ぶ */
  function recover(done){
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){}); }catch(e){}
    db().then(function(d){
      var tx = d.transaction(OS, 'readonly'), os = tx.objectStore(OS);
      var rq = os.getAllKeys ? os.getAllKeys() : null;
      if(!rq){ done(false); return; }
      rq.onsuccess = function(){
        var keys = rq.result || [], left = keys.length, restored = false;
        // 写しを取る前から遊んでいた人の分。localStorage にしか無いものを写す
        try{
          for(var i=0; i<localStorage.length; i++){
            var lk = localStorage.key(i);
            if(lk && lk.indexOf('ward7.') === 0 && keys.indexOf(lk) < 0) mirror(lk, get(lk));
          }
        }catch(e){}
        if(!left){ done(false); return; }
        keys.forEach(function(k){
          var g = os.get(k);
          g.onsuccess = function(){
            var have = get(k);
            if(have === null && typeof g.result === 'string'){
              try{ localStorage.setItem(k, g.result); restored = get(k) === g.result || restored; }catch(e){}
            }else if(have !== null && have !== g.result){
              mirror(k, have);                   // 写しが古い。こちらが正
            }
            if(--left === 0) done(restored);
          };
          g.onerror = function(){ if(--left === 0) done(restored); };
        });
      };
      rq.onerror = function(){ done(false); };
    }).catch(function(){ done(false); });
  }
  return { get:get, set:set, recover:recover };
})();

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


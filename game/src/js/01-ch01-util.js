/* =========================================================================
   1. ユーティリティ
   ========================================================================= */
var clamp = function(/** @type {any} */ v,/** @type {any} */ a,/** @type {any} */ b){ return v<a?a:(v>b?b:v); };
var lerp  = function(/** @type {any} */ a,/** @type {any} */ b,/** @type {any} */ t){ return a+(b-a)*t; };
var TAU = Math.PI*2;
var DEG = Math.PI/180;   // 人体の角度は度で書いたほうが意図が読める

/* three.js の版差を吸収する（r128 → r186）。
   画も明るさも r128 で一つずつ撮って合わせてきたので、版を上げても
   見え方を変えないことを先に保証し、そのうえで必要なところから直していく。

   1) 色管理：r152 から Color に書いた値は sRGB とみなされ線形へ変換される。
      このゲームは SRGB(hex) で自分で線形にしてから渡しているので、
      変換が二重に掛かる。r128 と同じく「書いた値をそのまま使う」に戻す。
   2) 光：r155 で旧来の光（legacy lights）が消えた。旧来は光の色に π を掛け、
      距離の減衰は pow(1 - d/distance, decay) だった。新しい減衰は
      1/d^decay で、同じ数値を入れると近くは眩しく遠くは暗くなる。
      光の強さを読み書きしている箇所が 30 近くあり、そのうちいくつかは
      強さの値そのものを閾値に使っているので（自己診断を含む）、
      値の側ではなく光の計算の側を旧来に戻す。 */
THREE.ColorManagement.enabled = false;
var THREE_LEGACY_LIGHTS = (function(){
  var src = THREE.ShaderChunk.lights_pars_begin, n = 0;
  function sub(/** @type {any} */ a, /** @type {any} */ b){ if(src.indexOf(a) >= 0){ src = src.split(a).join(b); n++; } }
  sub('vec3 irradiance = ambientLightColor;', 'vec3 irradiance = ambientLightColor * PI;');
  sub('light.color = directionalLight.color;', 'light.color = directionalLight.color * PI;');
  sub('vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );',
      'vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight ) * PI;');
  // 点光源とスポットはどちらもこの関数を通る。π もここで掛ける
  var re = /float getDistanceAttenuation\([^)]*\) \{[\s\S]*?return distanceFalloff;\s*\}/;
  if(re.test(src)){
    src = src.replace(re,
      'float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {\n' +
      '\tif ( cutoffDistance > 0.0 && decayExponent > 0.0 ) return PI * pow( saturate( - lightDistance / cutoffDistance + 1.0 ), decayExponent );\n' +
      '\treturn PI;\n}');
    n++;
  }
  THREE.ShaderChunk.lights_pars_begin = src;
  return n === 4;                       // 自己診断で確かめる。版を上げて文面が変わると false
})();

/* 振動。iPhone の Safari は navigator.vibrate を持たず、これまで iPhone では
   一度も震えていなかった。iOS アプリの中では WKWebView からネイティブへ
   渡し、Taptic Engine で鳴らす（ios/Sources/AppDelegate.swift の ward7haptic）。
   pat は ms の数、または [鳴る, 休む, 鳴る, ...] の配列（vibrate と同じ形）。 */
function haptic(/** @type {any} */ pat){
  if(typeof settings !== 'undefined' && settings.haptics === false) return;   // 設定「振動」
  if(typeof BOT !== 'undefined' && BOT.on) return;
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
  var DB = 'ward7', OS = 'kv', dbp = /** @type {any} */ (null);
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
  function mirror(/** @type {any} */ k, /** @type {any} */ v){
    db().then(function(/** @type {any} */ d){
      var tx = d.transaction(OS, 'readwrite');
      if(v === null) tx.objectStore(OS).delete(k); else tx.objectStore(OS).put(v, k);
    }).catch(function(){});
  }
  function get(/** @type {any} */ k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
  function set(/** @type {any} */ k, /** @type {any} */ v){
    try{ localStorage.setItem(k, v); }catch(e){}
    mirror(k, v);
  }
  /* 起動時に一度。戻したものがあれば true で done を呼ぶ */
  function recover(/** @type {any} */ done){
    try{ if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(function(){}); }catch(e){}
    db().then(function(/** @type {any} */ d){
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
        keys.forEach(function(/** @type {any} */ k){
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

var wakeLock = /** @type {any} */ (null), wakeWant = false;
function keepAwake(/** @type {any} */ on){
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

function mulberry32(/** @type {any} */ a){
  var f = function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    var t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  // 状態の保存と巻き戻し（第 15.3 節 SNAP）のために、内側の数を読み書きできるようにする
  f.getState = function(){ return a | 0; };
  f.setState = function(/** @type {any} */ v){ a = v | 0; };
  return f;
}
var rnd = mulberry32(Date.now() & 0x7fffffff);
/* 乱数の流れを用途で分ける（設計指示書 第 15.3 節）。
   rnd   … 生成（テクスチャ・間取り・置き物・カルテの順）
   rndAI … 遊びの判断（追跡者の巡回先・回り込みの向き）
   rndFx … 見た目と音だけ（痙攣・視線・目の明滅・環境音）
   ひとつの流れを皆で引いていると、見た目の揺れを 1 回足しただけで追跡者の巡回先が
   変わり、ボットの測定が「同じ種・同じ遊び」で比べられなくなる。
   3 本とも病棟に入るときに種から作り直す（startGame） */
var rndAI = mulberry32(0x5eed ^ 0xA1), rndFx = mulberry32(0x5eed ^ 0xF3);
function seedStreams(/** @type {any} */ seed){
  rndAI = mulberry32(((seed ^ 0x2545F491) >>> 0) || 1);
  rndFx = mulberry32(((seed ^ 0x9E3779B9) >>> 0) || 1);
}

var IS_TOUCH = (('ontouchstart' in window) || navigator.maxTouchPoints > 0);
if(!IS_TOUCH) document.body.classList.add('notouch');
var DEBUG = /[?&]debug=1/.test(location.search);


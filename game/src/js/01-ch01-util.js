/* =========================================================================
   1. ユーティリティ
   ========================================================================= */
var clamp = function(v,a,b){ return v<a?a:(v>b?b:v); };
var lerp  = function(a,b,t){ return a+(b-a)*t; };
var TAU = Math.PI*2;
var DEG = Math.PI/180;   // 人体の角度は度で書いたほうが意図が読める

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



/* =========================================================================
   0. ブート／致命エラー処理
   ========================================================================= */
/* 型の検め（tsconfig.json）では要素の種類を問わない。値・描画面などを直接触るので */
var $: (id: string) => any = function(id){ return document.getElementById(id); };
var bootedOK = false;

function fatal(msg: any){
  try{
    $('boot').hidden = true;
    $('title').hidden = true;
    $('errMsg').textContent = msg;
    $('err').hidden = false;
  }catch(e){ /* 最終手段 */ alert(msg); }
}
$('errRetry').addEventListener('click', function(){ location.reload(); });

/* 起動を打ち切る印。致命の画面を出した後に投げて残りを走らせない（TypeScript の台本では
   大域の return が書けないので、投げて止める）。受け手はこの印だけは黙って捨てる */
var W7_ABORT = { abort:true };
window.addEventListener('error', function(e){
  if(e.error === W7_ABORT){ e.preventDefault(); return; }
  if(!bootedOK) fatal('スクリプトエラー: ' + (e.message || 'unknown'));
  else console.error('[WARD7]', e.message);
});

if(typeof THREE === 'undefined'){
  fatal('3Dライブラリを読み込めませんでした。通信環境を確認して再読み込みしてください。');
  throw W7_ABORT;
}
(function(){
  try{
    var c = document.createElement('canvas');
    var gl = c.getContext('webgl') || c.getContext('experimental-webgl');
    if(!gl) throw 0;
  }catch(e){
    fatal('このブラウザはWebGLに対応していません。設定でWebGLを有効にするか、別のブラウザをお試しください。');
    return;
  }
})();


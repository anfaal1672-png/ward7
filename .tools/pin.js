/* 画質を固定して撮る。
   端末判定（deviceMemory/hardwareConcurrency）はこのコンテナで 0 を返すので、
   ただ開くと最低品質の姿しか撮れない。settings.quality をあとから書いても
   腕やテクスチャは読み込み時に作られているので作り直されない
   （実機では画質ボタンが location.reload() するので問題は起きない）。
   だから localStorage に入れてから開く。
   使い方: node pin.js <html> [枚数] [間隔ms] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings',
    JSON.stringify({quality:3, diff:2, gamma:1, invert:false})); }catch(e){} });
  await p.goto('file://'+process.argv[2]+'?debug=1&bot=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.skipUI(true); A.seed(4242); A.botOn(true); A.start();
    // 描画が重いと本編が品質を下げにいくので、撮影中は戻し続ける
    setInterval(()=>{ if(A.settings.quality!==3){ A.settings.quality=3; A.forceQC(); } }, 200); });
  const n=+(process.argv[3]||4), gap=+(process.argv[4]||9000);
  for(let i=0;i<n;i++){ await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`pin_${i}.png`}); }
  const q=await p.evaluate(()=>({q:window.__WARD7.settings.quality, dpr:window.devicePixelRatio}));
  console.log('quality', JSON.stringify(q), 'err', errs.length);
  errs.slice(0,3).forEach(e=>console.log(' !', e.slice(0,140)));
  await b.close();
})();

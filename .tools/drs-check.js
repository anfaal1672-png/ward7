/* 内部解像度の自動調整（設計指示書 第 8.3 節）。?drs=1 で自動操作の下でも動かし、
   遅い SwiftShader で倍率が下がること、熱の段階で上限が下がることを見る。
   使い方: node drs-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:3});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2]+'?drs=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  const pr0 = await p.evaluate(()=>window.__W7R.getPixelRatio());
  await p.waitForTimeout(12000);
  const pr1 = await p.evaluate(()=>window.__W7R.getPixelRatio());
  await p.evaluate(()=>window.__w7thermal(3));
  await p.waitForTimeout(500);
  const pr2 = await p.evaluate(()=>window.__W7R.getPixelRatio());
  console.log(JSON.stringify({start:pr0, after12s:pr1, critical:pr2, errs}));
  const ok = pr1 < pr0 && pr2 <= pr0*0.7 + 1e-6 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

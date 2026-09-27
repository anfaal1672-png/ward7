/* 写真素材（設計指示書 第 7.2 節）の前後を同じ場所で撮る。
   高精細（q2）で、assets.js あり（貼られる）と無し（手続きの絵のまま）。
   使い方: node photo-shot.js <html> <出力の接頭辞> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  for(const on of [false, true]){
    const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    if(!on) await p.route('**/assets.js', r=>r.fulfill({status:200,contentType:'application/javascript',body:''}));
    await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
    await p.goto('file://'+process.argv[2],{waitUntil:'load'});
    await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.player.pitch=-0.12; });
    if(on) await p.waitForFunction(()=>window.__WARD7.world.photo === true, null, {timeout:20000}).catch(()=>{});
    await p.waitForTimeout(3500);
    await p.screenshot({path:process.argv[3]+(on?'_photo.png':'_proc.png')});
    console.log(on?'写真':'手続き', 'photo=', await p.evaluate(()=>window.__WARD7.world.photo), 'errs', errs.length, errs.slice(0,2));
    await p.close();
  }
  await b.close();
})();

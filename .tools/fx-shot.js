/* 画面効果（設計指示書 第 8.2 節）の有無を同じ場所で撮る。
   長い見通しの利く向きを向かせ、ランプを点けて撮る。
   使い方: node fx-shot.js <html> <出力の接頭辞> [品質=3] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const q=+(process.argv[4]||3);
  for(const on of [false, true]){
    const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
    await p.addInitScript(([q,on])=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:q, diff:1, lang:'ja',
      fxBeam:on, fxAO:on, fxAA:on, fxDof:on})); }catch(e){} }, [q,on]);
    await p.goto('file://'+process.argv[2],{waitUntil:'load'});
    await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.cheats.freeze=true; });
    await p.waitForTimeout(800);
    await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player; const s=A.findLOSSpot(pl.x, pl.z, 12, 40);
      if(s) pl.yaw=Math.atan2(-(s.x-pl.x), -(s.z-pl.z)); pl.viewYaw=pl.yaw; pl.pitch=-0.05; pl.lamp=true; });
    await p.waitForTimeout(2500);
    await p.screenshot({path:process.argv[3]+(on?'_on.png':'_off.png')});
    console.log(on?'on':'off', 'errs', errs.length, errs.slice(0,2));
    await p.close();
  }
  await b.close();
})();

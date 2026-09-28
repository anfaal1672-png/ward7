/* 隠れて息を止めたときの左手（設計指示書 第 9.4 節）を撮る。使い方: node breath-shot.js <html> <png> */
const { chromium, EXEC, useUntil } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.cheats.freeze=true;
    const h=A.world.hides.find(x=>x.type==='locker')||A.world.hides[0]; A.player.x=h.exitX; A.player.z=h.exitZ; });
  await useUntil(p, ()=>!!window.__WARD7.player.hiding);
  await p.keyboard.down('ShiftLeft');
  await p.waitForFunction(()=>window.__WARD7.player.holdBreath, null, {timeout:30000}).catch(()=>{});
  await p.waitForTimeout(1500);
  await p.screenshot({path:process.argv[3]});
  const st = await p.evaluate(()=>({hiding:!!window.__WARD7.player.hiding, hold:window.__WARD7.player.holdBreath}));
  console.log(JSON.stringify(st), 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

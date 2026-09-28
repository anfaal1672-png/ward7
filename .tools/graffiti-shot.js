/* 小部屋の落書き（設計指示書 第 6.3 節「物語の小道具」）を正面から撮る。
   使い方: node graffiti-shot.js <html> <png> [章の添字=1] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const r = await p.evaluate((ch)=>{ const A=window.__WARD7; A.run.ch=ch; A.seed(9200); A.start(); A.cheats.invisible=true; A.cheats.freeze=true;
    const g=A.world.graffiti[0]; if(!g) return null;
    const pl=A.player; pl.x=g.x+g.nx*3.2; pl.z=g.z+g.nz*3.2; pl.yaw=Math.atan2(g.nx, g.nz); pl.viewYaw=pl.yaw; pl.pitch=0.05; pl.lamp=true;
    return g; }, +(process.argv[4]||1));
  await p.waitForTimeout(2500);
  await p.screenshot({path:process.argv[3]});
  console.log(JSON.stringify(r), 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

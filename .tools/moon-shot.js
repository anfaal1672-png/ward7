/* 窓の月明かり（設計指示書 第 7.3 節）を撮る。窓から 4m 離れ、斜めに窓と床の光を見る。
   使い方: node moon-shot.js <html> <png> [品質=2] [窓の番号=0] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const q=+(process.argv[4]||2), wi=+(process.argv[5]||0);
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript((q)=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:q, diff:1, lang:'ja'})); }catch(e){} }, q);
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  const r = await p.evaluate((wi)=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.cheats.freeze=true;
    const m=A.world.moon[wi]; if(!m) return { n:A.world.moon.length };
    const pl=A.player; pl.x = m.x - m.nx*3.6 + m.nz*1.2; pl.z = m.z - m.nz*3.6 - m.nx*1.2;
    pl.yaw = Math.atan2(-(m.x - pl.x), -(m.z - pl.z)); pl.viewYaw = pl.yaw; pl.pitch = 0.02; pl.lamp=false;
    return { n:A.world.moon.length, m }; }, wi);
  await p.waitForTimeout(3000);
  await p.screenshot({path:process.argv[3]});
  console.log(JSON.stringify(r), 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

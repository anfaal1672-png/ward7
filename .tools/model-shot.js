/* 小道具の立体素材（設計指示書 第 7.2 節）を撮る。種類ごとに最初の置き場所から 1.6m 離れて見る。
   使い方: node model-shot.js <html> <接頭辞> [種類...] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(9200); A.start(); A.cheats.invisible=true; A.cheats.freeze=true; });
  await p.waitForFunction(()=>window.__WARD7.world.modelsPlaced > 0, null, {timeout:30000}).catch(()=>{});
  const info = await p.evaluate(()=>{ const w=window.__WARD7.world; const c={}; w.modelSlots.forEach(s=>c[s.kind]=(c[s.kind]||0)+1); return { placed:w.modelsPlaced, kinds:c }; });
  console.log(JSON.stringify(info), 'errs', errs.slice(0,2));
  const ok = info.placed > 0 && info.kinds.medbox > 0 && !errs.length;
  for(const kind of (process.argv.slice(4).length ? process.argv.slice(4) : ['clock','extinguisher','medbox','stool'])){
    const ok = await p.evaluate((kind)=>{ const A=window.__WARD7, s=A.world.modelSlots.find(x=>x.kind===kind); if(!s) return false;
      const pl=A.player, d=kind==='clock'?2.2:1.6, ry=s.ry, fx=Math.sin(ry), fz=Math.cos(ry);
      pl.x = s.x + fx*d; pl.z = s.z + fz*d; pl.yaw = Math.atan2(fx, fz); pl.viewYaw = pl.yaw;
      pl.pitch = kind==='clock' ? 0.35 : (kind==='medbox' ? -0.35 : -0.2); pl.lamp = true; return true; }, kind);
    if(!ok){ console.log(kind, '置き場所なし'); continue; }
    await p.waitForTimeout(1800);
    await p.screenshot({path:process.argv[3]+'-'+kind+'.png'});
  }
  await b.close();
  console.log(ok ? 'OK' : 'FAIL'); process.exit(ok?0:1);
})();

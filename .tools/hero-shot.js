/* 章の顔になる部屋（設計指示書 第 6.1 節）を撮る。大広間の中央から北の壁の方を見る。
   使い方: node hero-shot.js <html> <出力の接頭辞> [章の添字...] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const chs = process.argv.slice(4).map(Number); if(!chs.length) chs.push(0,1,4,5);
  const out=[];
  for(const ch of chs){
    const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:2, diff:1, lang:'ja'})); }catch(e){} });
    await p.goto('file://'+process.argv[2],{waitUntil:'load'});
    await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    const info = await p.evaluate((ch)=>{ const A=window.__WARD7; A.run.ch=ch; A.start(); A.cheats.invisible=true;
      const W=A.world, hall=W.rooms[W.rooms.length-1], pl=A.player;
      const c=(v, n)=>(v - 15)*4.2;
      pl.x = c(hall.cx); pl.z = c(hall.y) + 4.2*1.6; pl.yaw = 0; pl.pitch = 0.05; pl.lamp = true;
      return { hero:W.hero }; }, ch);
    await p.waitForTimeout(3500);
    await p.screenshot({path:process.argv[3]+'_'+ch+'.png'});
    out.push(JSON.stringify({ch, ...info, errs:errs.length}));
    await p.close();
  }
  console.log(out.join('\n'));
  await b.close();
})();

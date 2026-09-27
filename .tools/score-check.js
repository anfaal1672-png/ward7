/* 劇伴の段（設計指示書 第 10.3 節）を実ブラウザで確かめる。
   追跡者を目の前に置いて追跡させ → 見えない所へ移して追跡を切り、
   段が 3 → 下がる と 8 秒の静寂（resting）に入ることを見る。
   使い方: node score-check.js <html> */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{ if(m.type()==='error') errs.push(m.text()); });
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.pacifist = true; });
  const log=[];
  const samp=async(tag)=>{ log.push(tag+': '+JSON.stringify(await p.evaluate(()=>{ const A=window.__WARD7;
    return {mode:A.hunter.mode, lvl:A.audio.scoreLevel(), rest:A.audio.resting()}; }))); };
  await p.waitForTimeout(1500); await samp('開始');
  // 目の前に置く：追跡
  await p.evaluate(()=>{ const A=window.__WARD7, h=A.hunter, pl=A.player;
    const s=A.findLOSSpot(pl.x, pl.z, 3.5, 5.5); if(s){ h.x=s.x; h.z=s.z; } h.spawnGrace=0; });
  await p.waitForTimeout(2500); await samp('目の前');
  // 追跡を切る：透明化
  await p.evaluate(()=>{ window.__WARD7.cheats.invisible = true; });
  await p.waitForTimeout(3000); await samp('見失った');
  await p.waitForTimeout(7500); await samp('10.5 秒後');
  console.log(log.join('\n')); console.log('エラー', errs.length, errs.slice(0,3));
  await b.close();
})();

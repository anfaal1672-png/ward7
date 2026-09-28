/* 読み込みの時間（設計指示書 第 1.1 節：起動からタイトルまで 5 秒、章の読み込み 10 秒以内）。
   SwiftShader は CPU で描くので実機より遅い。ここで基準を満たせば実機では余裕がある、という
   向きの目安として測る。使い方: node load-check.js <html> [品質=2] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const q=+(process.argv[3]||2);
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript((q)=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:q, diff:1, lang:'ja'})); }catch(e){} }, q);
  const t0=Date.now();
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction(()=>{ const t=document.getElementById('title'); return window.__WARD7 && t && !t.hidden; }, null, {timeout:60000});
  const title=(Date.now()-t0)/1000;
  const chs=[];
  for(let ch=0; ch<7; ch++){
    const s = await p.evaluate(async(ch)=>{ const A=window.__WARD7; A.toTitle(); A.run.ch=ch; A.skipUI(true);
      const t=performance.now(); A.start(); await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      return (performance.now()-t)/1000; }, ch);
    chs.push(+s.toFixed(2));
  }
  const worst=Math.max(...chs);
  console.log(JSON.stringify({title:+title.toFixed(2), chapters:chs, errs:errs.slice(0,2)}));
  const ok = title <= 5 && worst <= 10 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

/* 初回起動の画質の実測（設計指示書 第 8.4 節）。保存が空の状態で開き、タイトルの情景を
   測って ward7.bench が done になること、重い SwiftShader では画質が上がらないことを見る。
   自動操作では測らない決まりなので、ここだけ navigator.webdriver を隠す。
   使い方: node bench-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ Object.defineProperty(Navigator.prototype, 'webdriver', { get:()=>false }); });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  // 読み込み直しを挟むことがあるので、done が書かれるまで待つ（最大 90 秒）
  let bench=null;
  for(let i=0;i<90;i++){
    await p.waitForTimeout(1000);
    bench = await p.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ward7.bench')||'null'); }catch(e){ return 'err'; } }).catch(()=>null);
    if(bench && bench.done) break;
  }
  const q = await p.evaluate(()=>{ try{ return JSON.parse(localStorage.getItem('ward7.settings')).quality; }catch(e){ return null; } }).catch(()=>null);
  console.log(JSON.stringify({bench, q, errs:errs.slice(0,3)}));
  const ok = bench && bench.done === 1 && typeof bench.ms === 'number' && q !== null && q <= 1 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

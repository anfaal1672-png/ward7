/* プレイテストの記録（設計指示書 第 17 章）。オンのときだけ残り、オフでは残らないこと。
   使い方: node tele-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const res={};
  for(const on of [true,false]){
    const p=await b.newPage({viewport:{width:390,height:844}});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript((on)=>{ try{ localStorage.clear(); localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja', tele:on})); }catch(e){} }, on);
    await p.goto('file://'+process.argv[2],{waitUntil:'load'});
    await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); });
    await p.waitForTimeout(800);
    await p.evaluate(()=>window.__WARD7.act('lose'));
    await p.waitForTimeout(800);
    res[on?'on':'off'] = await p.evaluate(()=>{ const e=JSON.parse(localStorage.getItem('ward7.tele')||'[]'); return e.map(x=>x.k); });
    res[(on?'on':'off')+'_errs'] = errs.length;
    await p.close();
  }
  console.log(JSON.stringify(res));
  const ok = res.on.indexOf('start')>=0 && res.on.indexOf('death')>=0 && res.off.length===0 && !res.on_errs && !res.off_errs;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

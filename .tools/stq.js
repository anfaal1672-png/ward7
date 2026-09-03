/* 4段階すべての品質で、実ブラウザ・実 WebGL のセルフテストを走らせる。
   使い方: node stq.js <html の絶対パス> */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const file=process.argv[2]||'/home/user/ward7/ward7.html';
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message));
  p.on('console',m=>{ if(m.type()==='error') errs.push('CONSOLE '+m.text()); });
  await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+file+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  for(const q of [0,1,2,3]){
    const r=await p.evaluate(async(q)=>{
      const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=q; A.forceQC(); A.start();
      await new Promise(r=>setTimeout(r,900));
      A.test();
      const t=window.__WARD7_TEST__;
      return {ok:t.ok, n:t.lines.length, fails:t.lines.filter(l=>/FAIL/.test(l))};
    }, q);
    console.log('q'+q+': 項目 '+r.n+'  FAIL '+r.fails.length+'  ok='+r.ok);
    r.fails.forEach(l=>console.log('   ! '+l));
  }
  console.log('エラー '+errs.length); errs.slice(0,5).forEach(e=>console.log('  '+e));
  await b.close();
})();

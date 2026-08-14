/* フレーム時間を実測する。
   SwiftShader は CPU 描画なので絶対値は実機の値にならないが、
   ・同じ環境での作業前／作業後の比（＝退行していないか）
   ・JS 側の更新にかかる時間（実機でも効く）
   は意味のある数字として取れる。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const file=process.argv[2], q=+(process.argv[3]||3), N=+(process.argv[4]||180);
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+file+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const r = await p.evaluate(async ({q,N})=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=q; A.start();
    await new Promise(r=>setTimeout(r,1200));          // 暖気
    const dts=[];
    await new Promise(done=>{
      let last=performance.now(), n=0;
      (function tick(){
        requestAnimationFrame(()=>{
          const now=performance.now(); dts.push(now-last); last=now;
          if(++n>=N) done(); else tick();
        });
      })();
    });
    dts.sort((a,b)=>a-b);
    const med=dts[dts.length>>1], p95=dts[Math.floor(dts.length*0.95)];
    return { med, p95, min:dts[0], max:dts[dts.length-1] };
  }, {q,N});
  console.log(`${path.basename(file).padEnd(12)} q${q}  フレーム時間 中央値 ${r.med.toFixed(1)}ms (${(1000/r.med).toFixed(1)}fps)  95%点 ${r.p95.toFixed(1)}ms  最短 ${r.min.toFixed(1)}  最長 ${r.max.toFixed(1)}  err=${errs.length}`);
  await b.close();
})();

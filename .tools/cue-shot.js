/* 音の方向表示（設定 cues）を撮る。ボットに遊ばせ、追跡者の足音で
   表示が出た瞬間に撮る。使い方: node cue-shot.js <html> [png] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings',
    JSON.stringify({quality:1, diff:1, gamma:1, invert:false, cues:true, motion:0.3, flash:0, fov:6, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.botOn(true); A.start(); });
  let shown=false;
  for(let i=0;i<120 && !shown;i++){
    await p.waitForTimeout(500);
    shown = await p.evaluate(()=>document.getElementById('cue').classList.contains('on'));
  }
  const txt = await p.evaluate(()=>document.querySelector('#cue span').textContent);
  await p.screenshot({path:process.argv[3]||'cue.png'});
  console.log('表示', shown, txt, 'fov', await p.evaluate(()=>window.__W7R && 0), 'err', errs.length, errs.slice(0,3));
  await b.close();
})();

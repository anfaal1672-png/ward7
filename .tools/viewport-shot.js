const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const W=+process.argv[3], H=+process.argv[4];
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:W,height:H}, deviceScaleFactor:3, isMobile:true, hasTouch:true});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(async()=>{ const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=2; A.start();
    await new Promise(r=>setTimeout(r,1400)); });
  await p.locator('canvas').first().screenshot({path:process.argv[5]});
  const r=await p.evaluate(()=>{
    const cv=document.querySelector('canvas');
    const t=document.getElementById('touch');
    const hud=document.getElementById('hud');
    const rects={};
    ['touch','hud','objSub','numGot'].forEach(id=>{ const e=document.getElementById(id);
      if(e){ const b=e.getBoundingClientRect(); rects[id]=[Math.round(b.x),Math.round(b.y),Math.round(b.width),Math.round(b.height)]; }});
    return { canvas:[cv.width,cv.height], dpr:window.devicePixelRatio, rects };
  });
  console.log(`${W}x${H} dpr=${r.dpr}  canvas=${r.canvas}  err=${errs.length}`);
  Object.entries(r.rects).forEach(([k,v])=>console.log('  ',k,v.join(',')));
  errs.slice(0,3).forEach(e=>console.log('  !',e.slice(0,140)));
  await b.close();
})();

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.waitForTimeout(1500);
  const r = await p.evaluate((gam)=>{
    document.getElementById('title').hidden = true;
    const st=document.getElementById('opt'); if(st){ st.hidden=false; st.scrollTop=260; }
    const g=document.getElementById('gam');
    if(g && gam){ g.value=gam; g.dispatchEvent(new Event('input')); }
    const el=document.getElementById('calib');
    return el ? Array.from(el.children).map(c=>getComputedStyle(c).backgroundColor) : null;
  }, process.argv[4]);
  await p.screenshot({path:process.argv[3]});
  console.log('較正見本', JSON.stringify(r), 'err', errs.length);
  errs.slice(0,3).forEach(e=>console.log(' !',e.slice(0,140)));
  await b.close();
})();

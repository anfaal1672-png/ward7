/* ボットに歩かせて何枚か撮る。1 か所だけ見ていると気づけない場所がある。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1&bot=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.skipUI(true); A.seed(4242); A.settings.quality=3; A.botOn(true); A.start(); });
  const n=+(process.argv[3]||6), gap=+(process.argv[4]||9000);
  for(let i=0;i<n;i++){
    await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`tour_${i}.png`});
  }
  const st=await p.evaluate(()=>{ const A=window.__WARD7;
    return { got:A.world.records.filter(r=>r.taken).length, of:A.world.records.length,
             hp:Math.round(A.player.hp), lamp:Math.round(A.player.battery),
             mode:A.hunter.mode, state:A.state() }; });
  console.log('巡回終了', JSON.stringify(st), 'err', errs.length);
  errs.slice(0,4).forEach(e=>console.log(' !',e.slice(0,140)));
  await b.close();
})();

const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(async()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,600));
    const P=A.player, Hn=A.hunter, cam=A.camera, THREE=window.THREE;
    cam.updateMatrixWorld(true);
    const f=new THREE.Vector3(); cam.getWorldDirection(f); f.y=0; f.normalize();
    Hn.x=P.x+f.x*1.5; Hn.z=P.z+f.z*1.5;
    Hn.group.visible=true; Hn.group.position.set(Hn.x,Hn.group.position.y,Hn.z);
    Hn.group.rotation.y=Math.atan2(-f.x,-f.z)+Math.PI;
    Hn.mode='chase';
    A.act('lose');   // チートの「即座に力尽きる」で捕まった演出を出す
  });
  await p.waitForTimeout(500);
  await p.locator('canvas').first().screenshot({path:'death_a.png'});
  await p.waitForTimeout(2600);
  await p.screenshot({path:'death_b.png'});
  console.log('撮影 err', errs.length); errs.slice(0,3).forEach(e=>console.log(' !',e.slice(0,140)));
  await b.close();
})();

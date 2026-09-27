/* 拾得物を目の前に並べて撮る。 */
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
    A.cheats.freeze=true; A.cheats.noShake=true;
    const P=A.player, cam=A.camera, THREE=window.THREE;
    cam.updateMatrixWorld(true);
    const f=new THREE.Vector3(); cam.getWorldDirection(f); f.y=0; f.normalize();
    const rt=new THREE.Vector3(-f.z,0,f.x);
    const put=(o,d,side,y)=>{ o.position.set(P.x+f.x*d+rt.x*side, y, P.z+f.z*d+rt.z*side); };
    setInterval(()=>{
      A.viewArm().visible=false;
      const W=A.world;
      if(W.records[0]) put(W.records[0].mesh,2.6,-1.05,1.35);
      if(W.records[0]) W.records[0].spr.visible=false;
      if(W.batteries[0]) put(W.batteries[0].mesh,2.6,-0.6,1.35);
      if(W.batteries[0]) W.batteries[0].spr.visible=false;
      if(W.key){ put(W.key.grp,2.6,-0.15,1.35); W.key.spr.visible=false; }
    },8);
    await new Promise(r=>setTimeout(r,900));
  });
  await p.locator('canvas').first().screenshot({path:process.argv[3]});
  console.log('撮影', process.argv[3], 'err', errs.length); errs.slice(0,4).forEach(e=>console.log(' !',e.slice(0,140)));
  await b.close();
})();

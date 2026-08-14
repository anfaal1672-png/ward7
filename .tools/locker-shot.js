const {chromium}=require('/opt/node22/lib/node_modules/playwright');const fs=require('fs');
(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const p=await b.newPage({viewport:{width:720,height:1280}});
await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',body:fs.readFileSync('/home/user/ward7/.tools/three.min.js','utf8')}));
await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
await p.waitForFunction('!!window.__WARD7',{timeout:20000});
await p.evaluate(async()=>{
  const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.forceQC(); A.start();
  await new Promise(r=>setTimeout(r,800));
  A.cheats.freeze=true; A.cheats.noShake=true;
  const W=A.world,P=A.player;
  const lk=W.hides.find(h=>h.type==='locker'); if(!lk) return;
  const t=setInterval(()=>{ P.x=lk.exitX; P.z=lk.exitZ;
    const dx=lk.x-P.x, dz=lk.z-P.z; P.yaw=Math.atan2(-dx,-dz); P.viewYaw=P.yaw; P.pitch=0; },8);
  await new Promise(r=>setTimeout(r,1400)); clearInterval(t);
});
await p.locator('canvas').first().screenshot({path:process.argv[3]||'locker.png'});
console.log('ok'); await b.close();})();

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
  const r = await p.evaluate(async(seed)=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(seed); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,700));
    A.cheats.freeze=true; A.cheats.noShake=true;
    const W=A.world, P=A.player;
    const CELL=4.2, GW=31;
    const c2w=(cx,cy)=>({x:(cx-(GW-1)/2)*CELL, z:(cy-(GW-1)/2)*CELL});
    if(!W.lockDoor) return {none:true};
    const pre=c2w(W.lockDoor.preCell.x, W.lockDoor.preCell.y);
    const dx=W.lockDoor.x-pre.x, dz=W.lockDoor.z-pre.z, L=Math.hypot(dx,dz)||1;
    const t=setInterval(()=>{
      P.x=pre.x - (dx/L)*3.4; P.z=pre.z - (dz/L)*3.4;
      P.yaw=Math.atan2(-dx/L, -dz/L); P.viewYaw=P.yaw;
      P.pitch=0; if(P.viewPitch!==undefined) P.viewPitch=0;
    },8);
    await new Promise(r=>setTimeout(r,1200)); clearInterval(t);
    return { at:[P.x.toFixed(1),P.z.toFixed(1)], door:[W.lockDoor.x.toFixed(1),W.lockDoor.z.toFixed(1)] };
  }, +(process.argv[4]||7));
  await p.locator('canvas').first().screenshot({path:process.argv[3]});
  console.log('施錠扉', JSON.stringify(r), 'err', errs.length);
  await b.close();
})();

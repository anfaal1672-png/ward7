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
  const r=await p.evaluate(async()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,600));
    A.cheats.freeze=true; A.cheats.noShake=true;
    A.world.power = true;                       // 電源を入れた状態にする
    const P=A.player, W=A.world;
    // いちばん近い非常灯の少し手前に立ち、そちらを向く
    let best=null, bd=1e9;
    W.lamps.forEach(L=>{ const d=Math.hypot(L.x-P.x, L.z-P.z); if(d<bd){bd=d;best=L;} });
    if(!best) return {none:true};
    const t=setInterval(()=>{
      const dx=best.x-P.x, dz=best.z-P.z, L=Math.hypot(dx,dz)||1;
      P.x=best.x-(dx/L)*4.2; P.z=best.z-(dz/L)*4.2;
      P.yaw=Math.atan2(-dx/L,-dz/L); P.viewYaw=P.yaw;
      P.pitch=0.10; if(P.viewPitch!==undefined) P.viewPitch=0.10;
      A.player.lamp=false;                      // 手元の灯りを消して非常灯だけにする
    },8);
    await new Promise(r=>setTimeout(r,1600)); clearInterval(t);
    return { dist:bd.toFixed(1), lamps:W.lamps.length };
  });
  await p.locator('canvas').first().screenshot({path:process.argv[3]});
  console.log('非常灯', JSON.stringify(r), 'err', errs.length);
  await b.close();
})();

/* 殴打の姿勢を撮る。swingT を立てると本編が移動を止めるので、追跡者を
   追いかけるリグでは画角に入らない（一度それでドアの向こう側を撮った）。
   見通せる場所を先に探し、そこへ置いてカメラを固定する。
   使い方: node swing-shot.js <html> [枚数] [間隔ms] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings',
    JSON.stringify({quality:3, diff:2, gamma:1, invert:false})); }catch(e){} });
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(4242); A.settings.quality=3; A.forceQC(); A.start();
    A.cheats.invisible = true;                 // 自分から追ってこないように
    const s = A.findLOSSpot(A.player.x, A.player.z, 4.0, 6.0);
    window.__S = s;
    if(!s) return;
    setInterval(()=>{
      const h=A.hunter, pl=A.player;
      h.x = s.x; h.z = s.z; h.stunT = 0;
      // 横向きに立たせる。殴打は前後の動きなので、横から見ないと読めない
      h.yaw = Math.atan2(-(pl.x-h.x), -(pl.z-h.z)) + Math.PI*0.5;
      if(h.swingT <= 0.02){ h.swingT = 0.42; h.punchArm = 1; h.attackCd = 9; }
      pl.yaw = Math.atan2(-(h.x-pl.x), -(h.z-pl.z));
      pl.viewYaw = pl.yaw; pl.pitch = -0.05; pl.vx = pl.vz = 0;
      A.settings.quality = 3;
      window.__S = {x:+h.x.toFixed(1), z:+h.z.toFixed(1), swing:+h.swingT.toFixed(2)};
    }, 16);
  });
  const n=+(process.argv[3]||4), gap=+(process.argv[4]||420);
  for(let i=0;i<n;i++){ await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`swing_${i}.png`}); }
  console.log(JSON.stringify(await p.evaluate(()=>window.__S)), 'err', errs.length);
  await b.close();
})();

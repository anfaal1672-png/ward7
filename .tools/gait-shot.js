/* 歩容を見るための撮影。追跡者をカメラの正面に置き、横から見えるように
   プレイヤーを動かさずに歩かせる。位相をずらして 4 枚撮る。
   使い方: node gait-shot.js <html> [枚数] [間隔ms] */
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
    A.cheats.freeze = false;
    // 見通せる場所を探して、そこへ追跡者を置き続ける（歩かせるため毎フレーム戻す）
    const spot = A.findLOSSpot(A.player.x, A.player.z, 4.5, 7.0);
    window.__G = spot;
    setInterval(()=>{
      const h=A.hunter, s=window.__G; if(!s) return;
      h.mode='chase';
      // カメラの正面 5m 付近を左右に往復させて、横から歩きが見えるようにする
      const t=performance.now()*0.0006;
      h.x = s.x + Math.sin(t)*1.6; h.z = s.z;
      h.yaw = Math.cos(t) > 0 ? Math.PI/2 : -Math.PI/2;
      // カメラを追跡者へ向ける（向けないと画面に入らない）
      const pl=A.player;
      pl.yaw = Math.atan2(-(h.x-pl.x), -(h.z-pl.z));
      pl.viewYaw = pl.yaw; pl.pitch = -0.06;
      A.settings.quality=3;
    }, 16);
  });
  const n=+(process.argv[3]||4), gap=+(process.argv[4]||700);
  for(let i=0;i<n;i++){ await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`gait_${i}.png`}); }
  console.log('spot', JSON.stringify(await p.evaluate(()=>window.__G)), 'err', errs.length);
  errs.slice(0,3).forEach(e=>console.log(' !', e.slice(0,120)));
  await b.close();
})();

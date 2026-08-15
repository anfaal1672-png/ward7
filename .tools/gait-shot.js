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
    /* 追跡者は自分で歩かせる。座標を毎フレーム書き換えると、本編が
       自分で計算する moved が 0 になり、歩容が止まって立ち姿勢しか
       撮れない（一度それで「脚が動いていない」と誤読した）。
       こちらは動かず、カメラだけ追跡者へ向ける。 */
    A.cheats.invisible = !!+(new URLSearchParams(location.search).get('patrol'));
    window.__G = null;
    setInterval(()=>{
      const h=A.hunter, pl=A.player;
      if(!A.cheats.invisible){ h.memT = 5; h.lastSeen = {x:pl.x, z:pl.z}; }  // 走りを見る
      pl.yaw = Math.atan2(-(h.x-pl.x), -(h.z-pl.z));
      pl.viewYaw = pl.yaw; pl.pitch = -0.10;
      pl.vx = pl.vz = 0;
      A.settings.quality=3;
      window.__G = {x:+h.x.toFixed(1), z:+h.z.toFixed(1), mode:h.mode,
                    walkK:+h.walkK.toFixed(2), run:+h.gaitRun.toFixed(2)};
    }, 16);
  });
  const n=+(process.argv[3]||4), gap=+(process.argv[4]||700);
  for(let i=0;i<n;i++){ await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`gait_${i}.png`}); }
  console.log('spot', JSON.stringify(await p.evaluate(()=>window.__G)), 'err', errs.length);
  errs.slice(0,3).forEach(e=>console.log(' !', e.slice(0,120)));
  await b.close();
})();

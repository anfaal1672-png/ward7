/* 旋回中の姿勢を撮る。倒し込み（バンク）は移動しているときにしか出ないので、
   静止させて姿勢だけ測る手が使えない。追跡者の少し前・左（右）に lastSeen を
   置き続けると、本編の経路追従がそのまま一定の角速度の旋回になる。
   カメラは斜め上後方から。使い方: node turn-shot.js <html> <左1|右-1> [枚数] [間隔] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const side = +(process.argv[3] || 1);
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
  await p.evaluate((side)=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(4242); A.settings.quality=3; A.forceQC(); A.start();
    A.cheats.invisible = true;              // 追跡に入れず、こちらで舵を切る
    window.__T = null;
    setInterval(()=>{
      const h=A.hunter, pl=A.player;
      // 進行方向から一定角ずらした点を追わせ続ける＝一定の角速度で回り続ける
      h.mode = 'hunt';
      const a = h.yaw + side*0.9;
      h.lastSeen = { x: h.x - Math.sin(a)*6, z: h.z - Math.cos(a)*6 };
      // カメラは斜め上後方。傾きは正面か後方からでないと読めない
      const ba = h.yaw + Math.PI;
      pl.x = h.x - Math.sin(ba)*3.6; pl.z = h.z - Math.cos(ba)*3.6;
      pl.yaw = Math.atan2(-(h.x-pl.x), -(h.z-pl.z));
      pl.viewYaw = pl.yaw; pl.pitch = -0.16; pl.vx = pl.vz = 0;
      A.settings.quality = 3;
      window.__T = { lead:+h.turnLead.toFixed(2), z:+h.parts.spine.rotation.z.toFixed(3),
                     walkK:+h.walkK.toFixed(2), mode:h.mode };
    }, 16);
  }, side);
  const n=+(process.argv[4]||2), gap=+(process.argv[5]||2000);
  for(let i=0;i<n;i++){ await p.waitForTimeout(gap);
    await p.locator('canvas').first().screenshot({path:`turn${side>0?'L':'R'}_${i}.png`}); }
  console.log('side', side, JSON.stringify(await p.evaluate(()=>window.__T)), 'err', errs.length);
  await b.close();
})();

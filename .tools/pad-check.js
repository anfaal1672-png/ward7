/* ゲームパッド（設計指示書 第 12.2 節）。navigator.getGamepads を差し替え、
   左スティックで進む・右スティックで向きが変わる・X でランプ・Start で一時停止 を見る。
   使い方: node pad-check.js <html> */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:844,height:390}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{
    try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:0})); }catch(e){}
    window.__pad = { axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0})) };
    navigator.getGamepads = ()=>[{ connected:true, mapping:'standard', axes:window.__pad.axes, buttons:window.__pad.buttons }];
  });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForTimeout(600);
  const s0 = await p.evaluate(()=>{ const pl=window.__WARD7.player; return {x:pl.x, z:pl.z, yaw:pl.yaw, lamp:pl.lamp}; });
  await p.evaluate(()=>{ window.__pad.axes[1] = -1; window.__pad.axes[2] = 0.8; });
  await p.waitForTimeout(3000);
  await p.evaluate(()=>{ window.__pad.axes[1] = 0; window.__pad.axes[2] = 0; window.__pad.buttons[2] = {pressed:true, value:1}; });
  await p.waitForTimeout(200);
  await p.evaluate(()=>{ window.__pad.buttons[2] = {pressed:false, value:0}; window.__pad.buttons[9] = {pressed:true, value:1}; });
  await p.waitForTimeout(200);
  const s1 = await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player; return {x:pl.x, z:pl.z, yaw:pl.yaw, lamp:pl.lamp, state:A.state()}; });
  const moved = Math.hypot(s1.x-s0.x, s1.z-s0.z);
  console.log(JSON.stringify({moved:+moved.toFixed(2), turned:+(s0.yaw-s1.yaw).toFixed(2), lamp:[s0.lamp, s1.lamp], state:s1.state, errs}));
  const ok = moved > 1 && Math.abs(s0.yaw-s1.yaw) > 2 && s0.lamp !== s1.lamp && s1.state === 3 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

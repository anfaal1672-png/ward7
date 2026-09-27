/* 忍び足と投擲（設計指示書 第 5.2 節）を実ブラウザで確かめる。
   - 瓶が置かれている / 拾える / 投げると割れて、聞こえる距離の追跡者が割れた場所へ向かう
   - 忍び足で動くと player.sneaking が立つ
   使い方: node throw-check.js <html> [png] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2, hasTouch:true});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:1, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const r1 = await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start();
    const w=A.world, pl=A.player, bt=w.bottles[0];
    const n = w.bottles.length;
    pl.x = bt.x + 0.3; pl.z = bt.z; A.use();
    return { placed:n }; });
  await p.waitForTimeout(300);
  r1.got = await p.evaluate(()=>window.__WARD7.player.bottles);
  // 追跡者を離れた所に置き、徘徊させておく。瓶を投げる
  await p.waitForTimeout(400);
  const r2 = await p.evaluate(()=>{ const A=window.__WARD7, h=A.hunter, pl=A.player;
    h.mode='patrol'; h.memT=0; h.lastSeen=null; h.spawnGrace=0; A.cheats.pacifist=true;
    const s=A.findLOSSpot(pl.x, pl.z, 7, 9); if(s){ h.x=s.x; h.z=s.z; }
    // 背を向けさせ、灯りも消す（見られて追跡になると、釣れたかどうかが測れない）
    h.yaw = Math.atan2(h.x-pl.x, h.z-pl.z); pl.lamp = false;
    pl.pitch = 0.1; return { before:h.mode }; });
  await p.keyboard.press('KeyG');
  await p.waitForFunction(()=>(window.__WARD7.player.lure||0) > 0, {timeout:4000}).catch(()=>{});
  const r3 = await p.evaluate(()=>{ const A=window.__WARD7, h=A.hunter, pl=A.player;
    return { after:h.mode, lure:pl.lure||0, left:pl.bottles, target:h.lastSeen }; });
  if(process.argv[3]) await p.screenshot({path:process.argv[3]});
  // 忍び足：Z を押しながら前へ
  await p.keyboard.down('KeyZ'); await p.keyboard.down('KeyW');
  await p.waitForTimeout(1200);
  const sneak = await p.evaluate(()=>({s:window.__WARD7.player.sneaking, v:Math.hypot(window.__WARD7.player.vx, window.__WARD7.player.vz)}));
  await p.keyboard.up('KeyZ'); await p.waitForTimeout(900);
  const walk = await p.evaluate(()=>({s:window.__WARD7.player.sneaking, v:Math.hypot(window.__WARD7.player.vx, window.__WARD7.player.vz)}));
  console.log(JSON.stringify({r1, r2, r3, sneak, walk, errs:errs.slice(0,3)}));
  const ok = r1.placed>=2 && r1.got===1 && r3.left===0 && r3.lure===1 && (r3.after==='hunt' || r3.after==='chase') && sneak.s && !walk.s && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

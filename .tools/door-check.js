/* 扉の開け方と覗く（設計指示書 第 5.2 節）を実ブラウザで確かめる。
   - 止まって開ける → opening が立ち、少し後に開く。追跡者は呼ばれない
   - 走って開ける   → すぐ開き、聞こえる距離の追跡者が hunt になる
   - 角で X を押すと、覗く側が決まり、カメラが横にずれる
   使い方: node door-check.js <html> */
const { chromium, EXEC, useUntil } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:1, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  // 追跡者を扉の近く（聞こえる距離）に置き、見えない・襲わないようにして開ける
  const setup = (run)=>p.evaluate((run)=>{ const A=window.__WARD7, w=A.world, pl=A.player, h=A.hunter;
    A.cheats.pacifist=true; A.cheats.invisible=!run; pl.hasKey=true; pl.lamp=false;
    const d=w.lockDoor; d.open=false; d.opening=0; d.group.visible=true;
    const C=4.2, c=d.preCell; pl.x=(c.x-15)*C; pl.z=(c.y-15)*C; pl.x+=(d.x-pl.x)*0.6; pl.z+=(d.z-pl.z)*0.6;
    h.mode='patrol'; h.memT=0; h.lastSeen=null; h.spawnGrace=0;
    const s=A.findLOSSpot(d.x, d.z, 6, 9); if(s){ h.x=s.x; h.z=s.z; }
    h.yaw=Math.atan2(h.x-d.x, h.z-d.z);
    return true; }, run);
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); });
  await p.waitForTimeout(500);
  await setup(false);
  await useUntil(p, ()=>{ const d=window.__WARD7.world.lockDoor; return d.opening>0 || d.open; });
  const q1 = await p.evaluate(()=>{ const A=window.__WARD7; return { opening:A.world.lockDoor.opening>0, open:A.world.lockDoor.open, mode:A.hunter.mode }; });
  await p.waitForFunction(()=>window.__WARD7.world.lockDoor.open, null, {timeout:60000}).catch(()=>{});
  const q2 = await p.evaluate(()=>{ const A=window.__WARD7; return { open:A.world.lockDoor.open, mode:A.hunter.mode, opening:A.world.lockDoor.opening, state:A.state(), t:A.player.time }; });
  await setup(true); await p.keyboard.down('ShiftLeft');
  await useUntil(p, ()=>window.__WARD7.world.lockDoor.open);
  const f1 = await p.evaluate(()=>{ const A=window.__WARD7; A.cheats.invisible=true; return { open:A.world.lockDoor.open, mode:A.hunter.mode }; });
  await p.keyboard.up('ShiftLeft');
  // 覗く：左右どちらかが開けていて、もう片方が壁の所を探して立たせる
  const pk = await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player;
    A.hunter.mode='patrol'; A.hunter.lastSeen=null;
    const g=A.world.grid;
    for(let y=1;y<30;y++) for(let x=1;x<30;x++){ if(g[y*31+x]!==0) continue;
      pl.x=(x-15)*4.2; pl.z=(y-15)*4.2;
      for(let a=0;a<8;a++){ pl.yaw=a*Math.PI/4; if(A.peekSide()!==0) return { side:A.peekSide() }; } }
    return { side:0 }; });
  // 描画が遅い所ではゲーム内の時間が壁時計より遅れて進むので、決め打ちの待ちでなく状態を待つ
  await p.keyboard.down('KeyX'); await p.waitForFunction(()=>window.__WARD7.peek.k>0.8, null, {timeout:15000}).catch(()=>{});
  const pk2 = await p.evaluate(()=>{ const A=window.__WARD7, o=A.peekOffset(); return { k:A.peek.k, off:o?Math.hypot(o.x,o.z):0 }; });
  await p.keyboard.up('KeyX'); await p.waitForFunction(()=>window.__WARD7.peek.k<0.1, null, {timeout:15000}).catch(()=>{});
  const pk3 = await p.evaluate(()=>window.__WARD7.peek.k);
  console.log(JSON.stringify({q1,q2,f1,pk,pk2,pk3,errs:errs.slice(0,3)}));
  const ok = q1.opening && !q1.open && q2.open && q2.mode==='patrol' && f1.open && (f1.mode==='hunt'||f1.mode==='chase')
    && pk.side!==0 && pk2.k>0.8 && pk2.off>0.2 && pk3<0.1 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

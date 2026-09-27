/* 章（設計指示書 第 5.4・6.2 節）を実ブラウザで確かめる。
   1) 第1章を抜けると第2章が開き、「次の章へ」になる
   2) 第2章：患者が壁際に立つ。灯りを顔に向けると振り向いて叫び、あれが呼ばれる
   3) 第3章：停電。電源を戻すまで非常口が使えない
   使い方: node chapter-check.js <html> [患者の png] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ if(!sessionStorage.getItem('x')){ localStorage.clear(); sessionStorage.setItem('x',1);
    localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); } }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const out={};
  // 1) 第1章を抜ける
  out.lock0 = await p.evaluate(()=>[...document.querySelectorAll('#segCh button')].map(b=>b.disabled));
  await p.evaluate(()=>{ const A=window.__WARD7; A.run.ch=0; A.start(); const pl=A.player, w=A.world;
    pl.got=pl.need; pl.hasKey=true; w.endgame=true; w.exit.open=true; pl.x=w.exit.x; pl.z=w.exit.z; });
  await p.waitForTimeout(300); await p.evaluate(()=>window.__WARD7.use());
  await p.waitForFunction(()=>!document.getElementById('win').hidden,{timeout:15000}).catch(()=>{});
  out.win1 = await p.evaluate(()=>({title:document.getElementById('winTitle').textContent,
    again:document.getElementById('btnAgain').textContent, unlocked:window.__WARD7.progress.unlocked}));
  // 2) 次の章へ → 第2章。患者
  await p.click('#btnAgain');
  await p.waitForFunction(()=>window.__WARD7.state()===2,{timeout:15000});
  out.ch2 = await p.evaluate(()=>({ch:window.__WARD7.run.ch, patients:window.__WARD7.patients().length}));
  await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player, pt=A.patients()[0], h=A.hunter;
    h.mode='patrol'; h.lastSeen=null; h.spawnGrace=0; A.cheats.pacifist=true;
    // 患者の 2.4m 手前に立ち、顔に灯りを向ける（患者は壁を向いているので、背中側から）
    const f = pt.yaw0; pl.x = pt.x - Math.sin(f)*2.4; pl.z = pt.z - Math.cos(f)*2.4;
    pl.yaw = Math.atan2(-(pt.x-pl.x), -(pt.z-pl.z)); pl.pitch = 0.05; pl.lamp = true; });
  await p.waitForFunction(()=>window.__WARD7.patients()[0].state==='stare',{timeout:8000}).catch(()=>{});
  await p.waitForTimeout(500);
  if(process.argv[3]) await p.screenshot({path:process.argv[3]});
  out.shriek = await p.evaluate(()=>{ const A=window.__WARD7, pt=A.patients()[0], h=A.hunter;
    return {state:pt.state, hmode:h.mode, called: !!h.lastSeen && Math.hypot(h.lastSeen.x-pt.x, h.lastSeen.z-pt.z) < 0.01}; });
  // 3) 第3章：停電
  await p.evaluate(()=>{ const A=window.__WARD7; A.run.ch=2; A.start(); A.cheats.invisible=true; const pl=A.player, w=A.world;
    pl.got=pl.need; pl.hasKey=true; w.endgame=true; w.exit.open=true; pl.x=w.exit.x; pl.z=w.exit.z; });
  await p.waitForTimeout(400); await p.evaluate(()=>window.__WARD7.use()); await p.waitForTimeout(600);
  out.dark = await p.evaluate(()=>({state:window.__WARD7.state(), btn:document.getElementById('bUse').textContent, bo:window.__WARD7.world.blackout}));
  await p.evaluate(()=>{ const A=window.__WARD7, w=A.world, pl=A.player; pl.x=w.lever.x; pl.z=w.lever.z; A.use(); });
  await p.waitForTimeout(500);
  await p.evaluate(()=>{ const A=window.__WARD7, w=A.world, pl=A.player; pl.x=w.exit.x; pl.z=w.exit.z; });
  await p.waitForTimeout(400); await p.evaluate(()=>window.__WARD7.use());
  await p.waitForFunction(()=>!document.getElementById('win').hidden,{timeout:15000}).catch(()=>{});
  out.lit = await p.evaluate(()=>({power:window.__WARD7.world.power, win:!document.getElementById('win').hidden,
    title:document.getElementById('winTitle').textContent}));
  // 4) 第4章：通気口。遠くの格子の近くで物音 → 天井裏に入って消え、そちらの格子から降りる
  await p.evaluate(()=>{ const A=window.__WARD7; A.cheats.invisible=false; A.run.ch=3; A.start(); A.cheats.pacifist=true; });
  await p.waitForTimeout(400);
  out.vent = await p.evaluate(()=>{ const A=window.__WARD7, h=A.hunter, V=A.vents();
    if(V.length < 2) return {n:V.length};
    // いちばん離れた 2 つ
    let a=V[0], b=V[1], bd=0;
    for(const x of V) for(const y of V){ const d=Math.hypot(x.x-y.x, x.z-y.z); if(d>bd){ bd=d; a=x; b=y; } }
    h.x=a.x; h.z=a.z; h.ventCd=0; h.spawnGrace=0; h.mode='hunt'; h.lastSeen={x:b.x, z:b.z};
    window.__vb = b;
    return {n:V.length, span:+bd.toFixed(1)}; });
  await p.waitForFunction(()=>!!window.__WARD7.hunter.vent, {timeout:5000}).catch(()=>{});
  out.vent.entered = await p.evaluate(()=>({inVent:!!window.__WARD7.hunter.vent, visible:window.__WARD7.hunter.group.visible}));
  await p.waitForFunction(()=>!window.__WARD7.hunter.vent, {timeout:120000}).catch(()=>{});
  out.vent.out = await p.evaluate(()=>{ const h=window.__WARD7.hunter, b=window.__vb;
    return {visible:h.group.visible, near:+Math.hypot(h.x-b.x, h.z-b.z).toFixed(1), state:window.__WARD7.state(), ventT:h.ventT, t:window.__WARD7.player.time}; });
  // 5) 終章：チート無しで抜けると物語の結末（脱出）になる
  await p.evaluate(()=>{ const A=window.__WARD7; for(const k in A.cheats) if(typeof A.cheats[k]==='boolean') A.cheats[k]=false;
    A.run.ch=6; A.start(); const pl=A.player, w=A.world;
    pl.got=pl.need; pl.hasKey=true; w.endgame=true; w.exit.open=true; pl.x=w.exit.x; pl.z=w.exit.z; pl.lamp=true; });
  await p.waitForTimeout(300); await p.evaluate(()=>window.__WARD7.use());
  await p.waitForFunction(()=>!document.getElementById('win').hidden,{timeout:20000}).catch(()=>{});
  out.finale = await p.evaluate(()=>({title:document.getElementById('winTitle').textContent,
    story:document.getElementById('winStory').textContent.slice(0,12), again:document.getElementById('btnAgain').textContent}));
  out.errs = errs.slice(0,3);
  console.log(JSON.stringify(out, null, 1));
  const ok = out.lock0[1]===true && out.win1.unlocked===2 && /次の章へ/.test(out.win1.again) && out.ch2.ch===1 &&
    out.ch2.patients>=3 && out.shriek.called && out.dark.state===2 && out.dark.btn==='停電' && out.lit.power && out.lit.win && out.vent.n>=4 && out.vent.entered.inVent && !out.vent.entered.visible && out.vent.out.visible && out.vent.out.near < 3 && out.finale.title==='脱出' && out.finale.story.length>0 && out.finale.again==='もう一度' && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

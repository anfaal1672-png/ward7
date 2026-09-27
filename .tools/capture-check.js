/* 捕獲と振りほどき・包帯（設計指示書 第 5.3・5.5 節）。
   通常難易度で：掴まれる → 0.7 秒動けない → 弾かれる → 表示が「あと 1 回」
   包帯を拾う → 「あと 2 回」に戻る。使い方: node capture-check.js <html> [png] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:1, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const r0 = await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start();
    return { txt:document.getElementById('txtHp').textContent, bandages:A.world.bandages.length }; });
  await p.waitForTimeout(400);
  const r0b = await p.evaluate(()=>document.getElementById('txtHp').textContent);
  await p.evaluate(()=>{ const A=window.__WARD7, h=A.hunter, pl=A.player;
    h.spawnGrace=0; h.attackCd=0; h.stunT=0; h.swingT=0; h.mode='chase';
    const a=pl.yaw+Math.PI*0.5; h.x=pl.x+Math.sin(a)*1.0; h.z=pl.z+Math.cos(a)*1.0; });
  await p.waitForFunction(()=>window.__WARD7.player.grabT > 0, {timeout:4000}).catch(()=>{});
  const g = await p.evaluate(()=>{ const pl=window.__WARD7.player; return {grabT:pl.grabT, x:pl.x, z:pl.z}; });
  if(process.argv[3]) await p.screenshot({path:process.argv[3]});
  await p.waitForFunction(()=>window.__WARD7.player.grabT <= 0, {timeout:8000}).catch(()=>{});
  await p.waitForTimeout(200);
  const r1 = await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player;
    return { grabT:pl.grabT, pushed:Math.hypot(pl.x-0, pl.z-0), hp:pl.hp, txt:document.getElementById('txtHp').textContent }; });
  r1.moved = await p.evaluate((g)=>Math.hypot(window.__WARD7.player.x-g.x, window.__WARD7.player.z-g.z), g);
  // 包帯を拾う
  await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player, bd=A.world.bandages[0];
    A.cheats.invisible=true; pl.x=bd.x+0.3; pl.z=bd.z; A.use(); });
  await p.waitForTimeout(500);
  const r2 = await p.evaluate(()=>({hp:window.__WARD7.player.hp, txt:document.getElementById('txtHp').textContent}));
  console.log(JSON.stringify({r0, r0b, g, r1, r2, errs:errs.slice(0,3)}));
  const ok = r0.bandages>=1 && r0b==='あと 2 回' && g.grabT>0 && r1.grabT<=0 && r1.moved>0.3 &&
             r1.txt==='あと 1 回' && r2.txt==='あと 2 回' && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

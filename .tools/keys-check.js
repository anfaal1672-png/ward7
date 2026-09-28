/* キーの割り当て（設計指示書 第 12.3 節）。設定でランプを L に、前へを I に替え、
   遊んでいる間に L でランプが切り替わり F では切り替わらないこと、I で前へ進むこと、
   保存されて読み込み直しても残ることを見る。使い方: node keys-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:1000,height:700}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>document.getElementById('btnOpt').click());
  const rebind = async (label, key)=>{
    await p.evaluate((label)=>{ const r=[...document.querySelectorAll('.keyrow')].find(x=>x.firstChild.textContent===label); r.querySelector('button').click(); }, label);
    await p.keyboard.press(key);
  };
  await rebind('ランプ', 'KeyL'); await rebind('前へ', 'KeyI');
  const shown = await p.evaluate(()=>[...document.querySelectorAll('.keyrow')].map(r=>r.textContent).join('|'));
  // 保存されたか（読み込み直すと初期化の台本が保存を上書きするので、ここで見る）
  const kept = await p.evaluate(()=>JSON.parse(localStorage.getItem('ward7.settings')).keys);
  await p.evaluate(()=>document.getElementById('btnOptBack').click());
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForTimeout(600);
  const l0 = await p.evaluate(()=>window.__WARD7.player.lamp);
  // 押した結果は条件で待つ（決め打ちの 200ms は遅い機械で落ちる。pad-check で一度落ちた）
  await p.keyboard.press('KeyL');
  await p.waitForFunction((l0)=>window.__WARD7.player.lamp !== l0, l0, {timeout:5000}).catch(()=>{});
  const l1 = await p.evaluate(()=>window.__WARD7.player.lamp);
  await p.keyboard.press('KeyF'); await p.waitForTimeout(600);
  const l2 = await p.evaluate(()=>window.__WARD7.player.lamp);
  // 前へ（I）：見通しの利く方を向いてから押す
  await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player; const s=A.findLOSSpot(pl.x, pl.z, 6, 12); if(s){ pl.yaw=Math.atan2(-(s.x-pl.x), -(s.z-pl.z)); pl.viewYaw=pl.yaw; } });
  const x0 = await p.evaluate(()=>[window.__WARD7.player.x, window.__WARD7.player.z]);
  await p.keyboard.down('KeyI');
  await p.waitForFunction((x0)=>Math.hypot(window.__WARD7.player.x-x0[0], window.__WARD7.player.z-x0[1]) > 0.8, x0, {timeout:15000}).catch(()=>{});
  await p.keyboard.up('KeyI');
  const moved = await p.evaluate((x0)=>Math.hypot(window.__WARD7.player.x-x0[0], window.__WARD7.player.z-x0[1]), x0);
  console.log(JSON.stringify({shown, kept, lamp:[l0,l1,l2], moved:+moved.toFixed(2), errs:errs.slice(0,3)}));
  const ok = kept && kept.lamp==='KeyL' && kept.fwd==='KeyI' && l1!==l0 && l2===l1 && moved>0.8 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

/* その場の操作説明（設計指示書 第 11.4 節）。隠れ場所の前に立つと「E で隠れる」が 1 度だけ出ること、
   割り当てを変えるとその キーで出ること、2 回目は出ないことを見る。使い方: node tips-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:1000,height:700}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja', keys:{use:'KeyU'}}));
    localStorage.removeItem('ward7.tips'); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const go = ()=>p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.cheats.freeze=true;
    const h=A.world.hides[0]; A.player.x=h.exitX; A.player.z=h.exitZ; return true; });
  // 描画の遅い所ではゲーム内の時間が壁時計より遅れるので、ゲーム内の時間で待つ
  await go();
  await p.waitForFunction(()=>/隠れる/.test(document.getElementById('toast').textContent), null, {timeout:120000}).catch(()=>{});
  const t1 = await p.evaluate(()=>document.getElementById('toast').textContent);
  const seen = await p.evaluate(()=>localStorage.getItem('ward7.tips'));
  // もう一度入り直しても出ない
  await p.evaluate(()=>{ const A=window.__WARD7; A.toTitle(); });
  await go();
  await p.waitForFunction(()=>window.__WARD7.player.time > 7, null, {timeout:120000}).catch(()=>{});
  const t2 = await p.evaluate(()=>document.getElementById('toast').textContent + '|' + document.getElementById('toast').classList.contains('on'));
  console.log(JSON.stringify({t1, seen, t2, errs:errs.slice(0,3)}));
  const ok = t1 === 'U で隠れる' && /hide/.test(seen||'') && !/隠れる\\|true/.test(t2) && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

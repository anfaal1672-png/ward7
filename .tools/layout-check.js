/* タッチのボタンの配置（設計指示書 第 12.1 節）。設定から編集を開き、「拾う」を画面の (30%, 40%) へ
   ドラッグして完了。保存され、遊んでいる間もその位置に出ること、ランプが点かないこと（編集中は
   ボタンの働きを渡さない）を見る。使い方: node layout-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const ctx=await b.newContext({viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:2});
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  const up = await p.waitForFunction('!!window.__WARD7', null, {timeout:90000}).then(()=>true).catch(()=>false);
  if(!up){ console.log('起動せず', errs); await b.close(); process.exit(1); }
  await p.evaluate(()=>{ document.getElementById('btnOpt').click(); document.getElementById('btnLayout').click(); });
  const vis = await p.evaluate(()=>!document.getElementById('layoutBar').hidden && document.getElementById('touch').classList.contains('edit'));
  const box = await p.locator('#bUse').boundingBox();
  await p.mouse.move(box.x+box.width/2, box.y+box.height/2); await p.mouse.down();
  await p.mouse.move(390*0.3, 844*0.4, {steps:8}); await p.mouse.up();
  const lb = await p.locator('#bLight').boundingBox();
  await p.mouse.click(lb.x+lb.width/2, lb.y+lb.height/2);          // 編集中に押してもランプは点かない
  await p.evaluate(()=>document.getElementById('btnLayoutDone').click());
  const saved = await p.evaluate(()=>JSON.parse(localStorage.getItem('ward7.settings')).btnPos);
  await p.evaluate(()=>{ document.getElementById('btnOptBack').click(); const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForTimeout(800);
  const b2 = await p.locator('#bUse').boundingBox();
  const cx = (b2.x + b2.width/2)/390, cy = (b2.y + b2.height/2)/844;
  console.log(JSON.stringify({vis, saved, center:[+cx.toFixed(3), +cy.toFixed(3)], errs:errs.slice(0,3)}));
  const ok = vis && saved && saved.bUse && Math.abs(cx-0.3)<0.03 && Math.abs(cy-0.4)<0.03 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

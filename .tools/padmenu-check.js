/* メニューのパッド操作（設計指示書 第 12.2 節）。タイトルで下へ動いて A で設定を開き、
   B で戻る。遊んでいる最中に Start で一時停止し、すぐには戻らないこと、もう一度 Start で戻ること。
   使い方: node padmenu-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:844,height:390}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{
    try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); }catch(e){}
    window.__pad = { axes:[0,0,0,0], buttons:Array.from({length:17},()=>({pressed:false,value:0})) };
    navigator.getGamepads = ()=>[{ connected:true, mapping:'standard', axes:window.__pad.axes, buttons:window.__pad.buttons }];
  });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  // CI のソフト描画は 1 フレームが 400ms を超えることがあり、短い押下はフレームの間に落ちる。
  // 実機と同じく「押している間に少なくとも 1 フレーム読まれる」ように、結果が出るまで押し続ける
  const holdUntil = async (n, fn)=>{ await p.evaluate((n)=>{ window.__pad.buttons[n]={pressed:true,value:1}; }, n);
    const ok = await p.waitForFunction(fn, null, {timeout:6000}).then(()=>true).catch(()=>false);
    // 離したことも、少なくとも 1 フレーム読まれるまで待つ（読まれないと次の押下が「押しっぱなし」に見える）
    await p.evaluate((n)=>{ window.__pad.buttons[n]={pressed:false,value:0}; }, n);
    await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(r)))));
    await p.waitForTimeout(200); return ok; };
  const until = (fn)=>p.waitForFunction(fn, null, {timeout:4000}).then(()=>true).catch(()=>false);
  // 落ちたときに、どの画面が出ていて焦点がどこにあったかを残す（CI でだけ落ちたことがある）
  const where = ()=>p.evaluate(()=>({ panel:[...document.querySelectorAll('.panel')].filter(e=>!e.hidden).map(e=>e.id).join(','),
    focus:document.activeElement && (document.activeElement.id || document.activeElement.textContent.slice(0,12)), state:window.__WARD7.state() }));
  await p.waitForTimeout(600);
  // 設定ボタンへ焦点を当てて A
  await p.evaluate(()=>document.getElementById('btnOpt').focus());
  const inOpt = await holdUntil(0, ()=>!document.getElementById('opt').hidden);
  // 下へ 2 回動く → 焦点がパネルの中のどれかに
  for(let i=0;i<2;i++){ const was = await p.evaluate(()=>{ window.__was=document.activeElement; return true; });
    await holdUntil(13, ()=>document.activeElement !== window.__was); }
  const focused = await p.evaluate(()=>{ const a=document.activeElement; return a && document.getElementById('opt').contains(a); });
  const beforeB = await where();
  const backTitle = await holdUntil(1, ()=>!document.getElementById('title').hidden);
  const afterB = await where();
  // 遊んでいる最中の Start
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForTimeout(800);
  await holdUntil(9, ()=>window.__WARD7.state() === 3);
  const paused = await p.evaluate(()=>window.__WARD7.state());
  await holdUntil(9, ()=>window.__WARD7.state() === 2);
  const resumed = await p.evaluate(()=>window.__WARD7.state());
  console.log(JSON.stringify({inOpt, focused, backTitle, paused, resumed, beforeB, afterB, errs}));
  const ok = inOpt && focused && backTitle && paused === 3 && resumed === 2 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

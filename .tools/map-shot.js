/* 一時停止の地図（設計指示書 第 11.3 節）を撮る。ボットにしばらく歩かせてから止める。
   使い方: node map-shot.js <html> [png] [秒] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:0, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.botOn(true); A.start(); A.cheats.invisible=true; A.cheats.slowmo=false; });
  // ボットが歩いた量を早回しで稼ぐ（描画が遅いので game 時間を進める）
  await p.waitForFunction((sec)=>window.__WARD7.player.time > sec, +(process.argv[4]||40), {timeout:600000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.botOn(false); });
  await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  const n = await p.evaluate(()=>{ let n=0; const v=window.__WARD7.world.visited; for(let i=0;i<v.length;i++) n+=v[i]; return n; });
  const el = await p.$('#pauseMap'); await el.screenshot({path:process.argv[3]||'map.png'});
  console.log('歩いたマス', n, 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

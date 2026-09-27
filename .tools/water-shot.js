/* 第6章の水を撮る（最高品質）。水の中に立ち、足音が水しぶきになることも見る。
   使い方: node water-shot.js <html> [png] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:3, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const r = await p.evaluate(()=>{ const A=window.__WARD7; A.run.ch=5; A.seed(4242); A.start(); A.cheats.invisible=true;
    const W=A.world, pl=A.player; let n=0, spot=null;
    for(let i=0;i<W.water.length;i++) if(W.water[i]){ n++; if(!spot) spot=i; }
    return {wetCells:n}; });
  // 水の区画の真ん中あたりへ移す（壁を向かないよう開けた向きへ）
  await p.evaluate(()=>{ const A=window.__WARD7, W=A.world, pl=A.player;
    for(let i=0;i<W.water.length;i++){ if(!W.water[i]) continue; const x=i%31, y=(i/31)|0;
      if(W.water[i+1] && W.water[i+2] && W.water[i+3]){ pl.x=(x-15)*4.2; pl.z=(y-15)*4.2; pl.yaw=-Math.PI/2; break; } }
    pl.pitch=-0.25; });
  await p.waitForTimeout(3000);
  const wet = await p.evaluate(()=>window.__WARD7.player.wet);
  await p.screenshot({path:process.argv[3]||'water.png'});
  console.log(JSON.stringify({r, wet, errs:errs.slice(0,3)}));
  await b.close();
})();

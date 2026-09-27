/* 捕まったときの演出 3 種（設計指示書 第 9.3 節）を撮る。正面・背後・隠れ場所から。
   演出の途中（6 割あたり）で 1 枚ずつ。使い方: node death-shot.js <html> <出力の接頭辞> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const out=[], errs=[];
  for(const kind of ['front','back','hide']){
  // 種類ごとに開き直す。2 回目からは短縮版になるので、どれも「初めての死」として撮る
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    await p.evaluate((kind)=>{ const A=window.__WARD7, pl=A.player, h=A.hunter; A.seed(4242); A.start(); A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 1.4, 2.2); if(s){ h.x=s.x; h.z=s.z; }
      const toH=Math.atan2(-(h.x-pl.x), -(h.z-pl.z));
      pl.yaw = kind==='back' ? toH+Math.PI : toH;
      if(kind==='hide'){ const hd=A.world.hides[0]; pl.x=hd.x+0.2; pl.z=hd.z; }
      window.__kind=kind; }, kind);
    await p.waitForTimeout(700);
    if(kind==='hide'){ await p.evaluate(()=>window.__WARD7.use()); await p.waitForTimeout(500);
      await p.evaluate(()=>{ const A=window.__WARD7, pl=A.player, h=A.hunter; h.x=pl.x+1.2; h.z=pl.z; }); }
    await p.evaluate(()=>window.__WARD7.act('lose'));
    await p.waitForTimeout(700);                 // 1.5 秒の演出の半ばあたり（撮るのにも時間が掛かる）
    await p.screenshot({path:process.argv[3]+'_'+kind+'.png'});
    out.push(kind + ':' + await p.evaluate(()=>window.__WARD7.state()));
    await p.close();
  }
  console.log(out.join(' '), 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

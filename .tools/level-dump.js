/* 章の病棟を書き出す（設計指示書 第 6.4 節）。Blender のブロックアウト（.tools/blender/ward7_blockout.py）が読む。
   病棟は章の種から作るので、ここで書いた物は遊ぶときの病棟と同じ（壁・部屋・隠れ場所）。
   使い方: node level-dump.js <html> <章 1〜7> [出力 .json] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const file=process.argv[2], ch=+(process.argv[3]||1), out=process.argv[4]||path.join(__dirname,'blender','ward_ch'+ch+'.json');
  const b=await chromium.launch({executablePath:EXEC,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:360,height:640}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+file+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  const d=await p.evaluate((ch)=>{
    const A=window.__WARD7; A.skipUI(true); A.settings.quality=0; A.run.ch = ch-1; A.start();
    const w=A.world, L=A.levelInfo();
    return { ch, cell:L.cell, gw:L.gw, gh:L.gh, grid:Array.from(w.grid),
             rooms:w.rooms.map(r=>({x:r.x,y:r.y,w:r.w,h:r.h,name:r.name||''})),
             hides:w.hides.map(h=>({type:h.type,x:+h.x.toFixed(2),z:+h.z.toFixed(2)})),
             start:{x:+A.player.x.toFixed(2), z:+A.player.z.toFixed(2)} };
  }, ch);
  await b.close();
  fs.writeFileSync(out, JSON.stringify(d)+'\n');
  console.log(out, 'grid', d.gw+'x'+d.gh, 'rooms', d.rooms.length, 'hides', d.hides.length, 'errs', errs.length);
})();

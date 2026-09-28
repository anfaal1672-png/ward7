/* 収録素材の音（設計指示書 第 10.1 節）。assets.js の WAV が解けて群ごとに揃い、足音・瓶・金属が
   素材で鳴ること（素材のバッファを持つ BufferSource が作られること）を見る。
   使い方: node sfx-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'})); }catch(e){}
    // 鳴らした BufferSource のうち、雑音ではなく素材（短い WAV）を持つものを数える
    const orig = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function(){ if(this.buffer && this.buffer.w7sfx) window.__sfxPlays = (window.__sfxPlays||0) + 1; return orig.apply(this, arguments); };
  });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForFunction(()=>{ const g=window.__WARD7.audio.sfxGroups(); return g.step_hard===5 && g.glass===3; }, null, {timeout:30000}).catch(()=>{});
  const groups = await p.evaluate(()=>window.__WARD7.audio.sfxGroups());
  await p.evaluate(()=>{ const Au=window.__WARD7.audio; Au.step(true, 0.9, 1); Au.step(false, 0.2, 1); Au.glass(4, 0.3); Au.clang(6, -0.2, 1); Au.hunterStep(5, true, 0.2, false, 0.5); });
  await p.waitForTimeout(300);
  const plays = await p.evaluate(()=>window.__sfxPlays||0);
  console.log(JSON.stringify({groups, plays, errs:errs.slice(0,3)}));
  const ok = groups.step_hard===5 && groups.step_soft===5 && groups.glass===3 && groups.metal===3 && groups.plate===2 && groups.amb_hvac===1 && groups.amb_water===1 && plays >= 5 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

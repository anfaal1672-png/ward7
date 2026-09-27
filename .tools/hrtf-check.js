/* 立体音響（設計指示書 第 10.2 節）。ヘッドホン設定では追跡者の持続音が HRTF の Panner を通り、
   真後ろにいるとき Panner の位置が後ろ（+Z）になること。スピーカー設定では StereoPanner のまま。
   使い方: node hrtf-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const res=[];
  for(const hrtf of [true,false]){
    const p=await b.newPage({viewport:{width:390,height:844}});
    const errs=[]; p.on('pageerror',e=>errs.push(e.message));
    await p.addInitScript((h)=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja', hrtf:h})); }catch(e){}
      // Panner を作るたびに控えておく（位置を読むため）
      const orig = AudioContext.prototype.createPanner;
      AudioContext.prototype.createPanner = function(){ const n = orig.call(this); (window.__pn = window.__pn || []).push(n); return n; };
    }, hrtf);
    await p.goto('file://'+process.argv[2],{waitUntil:'load'});
    await p.waitForFunction('!!window.__WARD7',{timeout:20000});
    await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.pacifist=true; A.cheats.freeze=true;
      const pl=A.player, h=A.hunter; const s=A.findLOSSpot(pl.x, pl.z, 4, 7); if(s){ h.x=s.x; h.z=s.z; }
      pl.yaw = Math.atan2(h.x-pl.x, h.z-pl.z);                  // 背を向ける（追跡者は真後ろ）
    });
    await p.waitForTimeout(2500);
    const r = await p.evaluate(()=>{ const P=window.__pn||[]; const hp=P[0];
      return { panners:P.length, model: hp && hp.panningModel, z: hp && +hp.positionZ.value.toFixed(2) }; });
    res.push({hrtf, ...r, errs:errs.length});
    await p.close();
  }
  console.log(JSON.stringify(res));
  const ok = res[0].panners > 0 && res[0].model === 'HRTF' && res[0].z > 0.3 && res[1].panners === 0 && !res[0].errs && !res[1].errs;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

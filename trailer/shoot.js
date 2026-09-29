// トレーラー用の撮影。仮想時計で 1 コマずつ進めて撮る。
// node shoot.js <shot名> [preview]
const { chromium, EXEC } = require('/home/user/ward7/.tools/pw.js');
const fs = require('fs'), path = require('path');
const SHOTS = require('./shots.js');
const FPS = 24, W = 1280, H = 720;
(async()=>{
  const name = process.argv[2], preview = process.argv[3] === 'preview';
  const S = SHOTS[name]; if(!S) throw new Error('no shot ' + name);
  const out = path.join(__dirname, 'frames', name); fs.mkdirSync(out, { recursive:true });
  const b = await chromium.launch({ executablePath:EXEC, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const p = await b.newPage({ viewport:{ width:W, height:H } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.addInitScript((q)=>{ let t=0; const qq=[]; const d0=Date.now();
    performance.now=()=>t; Date.now=()=>d0+t;
    window.requestAnimationFrame=(cb)=>{qq.push(cb); return qq.length;}; window.cancelAnimationFrame=()=>{};
    window.__step=(ms)=>{ t+=ms; const c=qq.splice(0); c.forEach(f=>{ try{f(t);}catch(e){ console.error(e.message); } }); };
    try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:q, diff:1, lang:'ja', motion:1, fxDof:false}));
         localStorage.removeItem('ward7.journal'); }catch(e){} }, S.q ?? 3);
  await p.goto('file:///home/user/ward7/ward7.html?debug=1', { waitUntil:'load' });
  for(let i=0; i<600 && !(await p.evaluate(()=>!!window.__WARD7 && !!window.W7_ASSETS)); i++){ await p.evaluate(()=>window.__step(16)); await p.waitForTimeout(15); }
  // 画面の上の表示を全部隠す（keep に挙げた物だけ残す）
  await p.addStyleTag({ content:'body *{visibility:hidden !important} canvas{visibility:visible !important}' + (S.keep ? S.keep.map(k => k + ',' + k + ' *{visibility:visible !important}').join('') : '') });
  await p.evaluate(`(()=>{ const A=window.__WARD7; A.skipUI(true); A.seed(${S.seed ?? 4242}); A.settings.quality=${S.q ?? 3}; A.run.ch=${S.ch ?? 0}; A.start();
    A.cheats.godmode=true; window.__S={};
    const r=A.gfx().renderer, orig=r.render.bind(r); r.render=function(sc,c){ try{ if(window.__S.pre) window.__S.pre(A); }catch(e){} return orig(sc,c); };
    (${S.setup})(A, window.__S); })()`);
  for(let i=0; i<(S.warm ?? 24); i++){ await p.evaluate(`(()=>{ const A=window.__WARD7; (${S.frame || '()=>{}'})(A, window.__S, 0, 0); window.__step(${1000/FPS}); })()`); }
  const N = Math.round(S.dur * FPS), pick = preview ? [0, Math.floor(N/2), N-1] : null;
  for(let f=0; f<N; f++){
    const t = f / FPS;
    await p.evaluate(`(()=>{ const A=window.__WARD7; (${S.frame || '()=>{}'})(A, window.__S, ${t}, ${f}); window.__step(${1000/FPS}); })()`);
    if(!pick || pick.includes(f)) await p.screenshot({ path:path.join(out, String(f).padStart(4, '0') + '.png') });
  }
  console.log(name, N, 'frames', errs.length ? errs.slice(0,2) : 'ok');
  await b.close();
})();

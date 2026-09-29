/* 撮影。ゲームを仮想時計で 1 コマずつ進め、映画のカメラで描かせ、ページの中の仕上げ（grade.js）を通した 1920×1080 を撮る。
   node capture.js <ショット名> [preview]   … timeline.js のショット区間を撮る（preview は最初・中・最後の 3 コマだけ）
   node capture.js text                    … 文字・黒・題名の区間を撮る（ゲームは動かさない）
   連番は out/<区間番号>/%05d.png に書く。sub:2 のショットはコマ数が 2 倍（make.sh が重ねる） */
const { chromium, EXEC } = require('/home/user/ward7/.tools/pw.js');
const fs = require('fs'), path = require('path');
const T = require('./timeline.js'), SHOTS = require('./shots.js');
const GRADE = fs.readFileSync(path.join(__dirname, 'grade.js'), 'utf8');
const OUT = process.env.W7_OUT || path.join(__dirname, 'out');
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--allow-file-access-from-files'];
const pad = n => String(n).padStart(5, '0');

async function page(b){
  const p = await b.newPage({ viewport: { width: T.W, height: T.H } });
  p.on('pageerror', e => console.error('pageerror', e.message));
  await p.addInitScript((band) => {
    let t = 0; const q = []; const d0 = Date.now();
    performance.now = () => t; Date.now = () => d0 + t;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; }; window.cancelAnimationFrame = () => {};
    window.__step = ms => { t += ms; q.splice(0).forEach(f => { try { f(t); } catch (e) { console.error(e.message); } }); };
    // ゲームにはシネスコの帯の高さだけを渡す
    Object.defineProperty(window, 'innerHeight', { get: () => band, configurable: true });
    try { localStorage.setItem('ward7.settings', JSON.stringify({ quality: 3, diff: 1, lang: 'ja', motion: 1, fxDof: false }));
          localStorage.removeItem('ward7.journal'); } catch (e) {}
  }, T.band);
  return p;
}

// 仕上げの面を PNG で受け取る（ページのスクリーンショットは合成待ちで 1 枚に 1 分かかるので使わない）
async function grab(p, file){
  const url = await p.evaluate(() => document.getElementById('w7grade').toDataURL('image/png'));
  fs.writeFileSync(file, Buffer.from(url.slice(url.indexOf(',') + 1), 'base64'));
}

// 区間の端の暗転（秒）。ショットは既定で短く溶かし、速い切り返しは切る
function fadeOf(seg, t){
  const fi = seg.fin ?? 0.25, fo = seg.fout ?? 0.25;
  const a = fi ? Math.min(1, t/fi) : 1, b = fo ? Math.min(1, (seg.dur - t)/fo) : 1;
  return Math.max(0, Math.min(a, b));
}

async function shot(name, preview){
  const si = T.segments.findIndex(s => s.kind === 'shot' && s.shot === name);
  if(si < 0) throw new Error('no shot ' + name);
  const seg = T.segments[si], S = SHOTS[name];
  const sub = S.sub || 1, N = Math.round(seg.dur*T.fps), dt = 1000/T.fps/sub;
  const dir = path.join(OUT, String(si).padStart(2, '0')); fs.mkdirSync(dir, { recursive: true });
  const b = await chromium.launch({ executablePath: EXEC, args: ARGS });
  const p = await page(b);
  await p.goto('file:///home/user/ward7/ward7.html?debug=1', { waitUntil: 'load' });
  for(let i = 0; i < 600 && !(await p.evaluate(() => !!window.__WARD7 && !!window.W7_ASSETS)); i++){
    await p.evaluate(() => window.__step(16)); await p.waitForTimeout(15); }
  await p.addStyleTag({ content: 'body *{visibility:hidden !important} #w7grade{visibility:visible !important}' });
  await p.evaluate(GRADE);
  await p.evaluate(`(()=>{ const A=window.__WARD7; A.skipUI(true); A.seed(${S.seed ?? 4242}); A.settings.quality=3; A.run.ch=${S.ch ?? 0}; A.start();
    A.cheats.godmode=true; const S=window.__S={ t:0 };
    const cam=A.camera, r=A.gfx().renderer, orig=r.render.bind(r), camFn=${S.cam || 'null'};
    const THREE=window.THREE, fwd=new THREE.Vector3();
    r.render=function(sc,c){
      if(c===cam){
        try{ if(S.pre) S.pre(A); }catch(e){ console.error(e.message); }
        const v = camFn ? camFn(A, S, S.t) : null;
        if(v){
          cam.position.set(v.p[0], v.p[1], v.p[2]); cam.lookAt(v.l[0], v.l[1], v.l[2]);
          if(v.fov){ cam.fov=v.fov; cam.updateProjectionMatrix(); }
          cam.updateMatrixWorld(true);
          if(v.hand===false){ const va=A.viewArm(); if(va) va.visible=false; }
          cam.getWorldDirection(fwd); const ft=A.flashTarget(); if(ft){ ft.position.copy(cam.position).addScaledVector(fwd, 12); ft.updateMatrixWorld(true); }
        }
      }
      return orig(sc,c);
    };
    (${S.setup})(A, S); })()`);
  const fr = `(${S.frame || '()=>{}'})`;
  for(let i = 0; i < (S.warm ?? 24); i++)
    await p.evaluate(`(()=>{ const A=window.__WARD7; window.__S.t=0; ${fr}(A, window.__S, 0, 0); window.__step(${1000/T.fps}); })()`);
  const pick = preview ? [0, Math.floor(N/2), N - 1] : null;
  const t0 = Date.now();
  for(let f = 0; f < N; f++){
    for(let s = 0; s < sub; s++){
      const t = (f + s/sub)/T.fps, shoot = !pick || pick.includes(f);
      await p.evaluate(`(()=>{ const A=window.__WARD7; window.__S.t=${t}; ${fr}(A, window.__S, ${t}, ${f});
        window.__step(${dt});
        ${shoot ? `window.W7G.frame({ img:A.gfx().renderer.domElement, seg:${JSON.stringify(seg)}, t:${t}, T:${seg.at + t}, fade:${fadeOf(seg, t)}, flash:0, expo:${seg.expo || 1} });` : ''} })()`);
      if(shoot) await grab(p, path.join(dir, pad(f*sub + s) + '.png'));
    }
    if(f % 24 === 23) console.log(name, f + 1, '/', N, ((Date.now() - t0)/(f + 1)/1000).toFixed(2) + 's/コマ');
  }
  console.log(name, 'done', N*sub, 'frames');
  await b.close();
}

async function text(preview){
  const b = await chromium.launch({ executablePath: EXEC, args: ARGS });
  const p = await page(b);
  await p.setContent('<html><body style="margin:0;background:#000"></body></html>');
  await p.evaluate(GRADE);
  await p.evaluate(() => document.fonts.load('600 58px "Noto Serif CJK JP"').then(() => document.fonts.load('400 26px "Noto Sans CJK JP"')));
  for(const [si, seg] of T.segments.entries()){
    if(seg.kind === 'shot') continue;
    const dir = path.join(OUT, String(si).padStart(2, '0')); fs.mkdirSync(dir, { recursive: true });
    const N = Math.round(seg.dur*T.fps), pick = preview ? [Math.floor(N*0.25), Math.floor(N*0.6)] : null;
    for(let f = 0; f < N; f++){
      if(pick && !pick.includes(f)) continue;
      const t = f/T.fps;
      await p.evaluate(o => window.W7G.frame(o), { img: null, seg, t, T: seg.at + t, fade: 1, flash: 0 });
      await grab(p, path.join(dir, pad(f) + '.png'));
    }
    console.log('text', si, seg.kind, N);
  }
  await b.close();
}

(async () => {
  const [what, mode] = process.argv.slice(2);
  if(what === 'text') await text(mode === 'preview');
  else await shot(what, mode === 'preview');
})().catch(e => { console.error(e); process.exit(1); });

/* 実ブラウザ・実 WebGL で起動して、シェーダのコンパイルと描画を確かめる。
   スタブの harness はシェーダを一切コンパイルしないので、GLSL の間違いは
   そこを素通りしてしまう。ここだけが本物の GPU を通る検証。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const file = process.argv[2] || '/home/user/ward7/ward7.html';
  const quality = process.argv[3] !== undefined ? +process.argv[3] : 3;
  const shot = process.argv[4] || null;
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errs = [], warns = [], logs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => {
    const t = m.text();
    if (m.type() === 'error') errs.push('CONSOLE ' + t);
    else if (m.type() === 'warning') warns.push(t);
    else logs.push(t);
  });
  // three.js は手元の r128 を返す（回線に依存させない）
  await page.route('**/three.min.js', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript',
                body: fs.readFileSync(path.join(__dirname, 'three.min.js'), 'utf8') }));

  await page.goto('file://' + file + '?debug=1', { waitUntil: 'load' });
  await page.waitForFunction('!!window.__WARD7', { timeout: 20000 });

  const res = await page.evaluate(async (q) => {
    const A = window.__WARD7;
    A.skipUI(true); A.seed(7); A.settings.quality = q; A.start();
    await new Promise(r => setTimeout(r, 1200));
    const cv = document.querySelector('canvas');
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const out = { renderer: '', w: cv.width, h: cv.height, progs: 0 };
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    if (dbg) out.renderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
    out.glErr = gl.getError();
    return out;
  }, quality);

  // 画面が真っ黒／真っ白でないか。実際に絵が出ているかはここでしか分からない
  const buf = await page.locator('canvas').first().screenshot();
  if (shot) fs.writeFileSync(shot, buf);
  /* 既定のフレームバッファは合成後に無効化される。rAF の中、つまり
     ゲーム自身が描いた直後に読む。ここを外すと必ず真っ黒が返り、
     「描けていない」と誤って判定してしまう（実際そうなった）。 */
  const stats = await page.evaluate(() => new Promise(res => {
    requestAnimationFrame(() => {
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      const w = cv.width, h = cv.height;
      const px = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      let sum = 0, mn = 255, mx = 0, nz = 0;
      const hist = new Array(16).fill(0);
      for (let i = 0; i < px.length; i += 4) {
        const l = (px[i] * 0.299 + px[i+1] * 0.587 + px[i+2] * 0.114);
        sum += l; if (l < mn) mn = l; if (l > mx) mx = l; if (l > 2) nz++;
        hist[Math.min(15, l >> 4)]++;
      }
      const n = px.length / 4;
      res({ mean: sum / n, min: mn, max: mx, nonBlackPct: nz / n * 100,
            state: window.__WARD7.state(),
            hist: hist.map(v => Math.round(v / n * 100)) });
    });
  }));

  await browser.close();
  const shaderErrs = errs.filter(e => /shader|GLSL|program|compile/i.test(e));
  console.log(`file=${path.basename(file)} q${quality}  GL=${res.renderer || '?'}  ${res.w}x${res.h}  glError=${res.glErr}`);
  console.log(`  state=${stats.state} 画面 平均輝度 ${stats.mean.toFixed(1)}  範囲 ${stats.min}..${stats.max}  非黒 ${stats.nonBlackPct.toFixed(1)}%`);
  console.log(`  輝度分布(16段) ${stats.hist.join(',')}`);
  console.log(`  エラー ${errs.length}（うちシェーダ関連 ${shaderErrs.length}）  警告 ${warns.length}`);
  errs.slice(0, 8).forEach(e => console.log('   ! ' + e.slice(0, 200)));
  warns.slice(0, 4).forEach(e => console.log('   ~ ' + e.slice(0, 160)));
  process.exit(errs.length ? 1 : 0);
})();

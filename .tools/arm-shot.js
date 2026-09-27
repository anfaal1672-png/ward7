/* 一人称の腕とランプだけを撮って測る。毎フレーム必ず画面に居るのに、
   通常の撮影では小さすぎて造形の粗が読めない。本編を隠し、
   背景を一様な灰にして、腕のシーンだけを写す。

   「背景色と違う画素＝腕」では切り分けられない。最終合成が周辺減光・
   色分け・粒子を掛けるので、無地の灰も画面のどこかで必ず色が変わる
   （これで面積 99% と出て一度騙された）。腕を消した画と引き算する。

   面積・平均輝度・輝度の散らばりを出す。散らばりは造形の読みやすさの
   目安になる（真っ平らな塗りだと小さく、陰影が付くと大きくなる）。

   使い方: node .tools/arm-shot.js <html> [png] [fov] [bg] [pose]
     fov  … 腕用カメラの画角。小さいほど寄る（既定 0 = ゲームと同じ）
     bg   … 背景の明るさ 0..255（既定 90）
     pose … 'game'（既定）／'side'（真横から）／'top'（真上から） */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
const path = require('path');

(async () => {
  const file = process.argv[2] || '/home/user/ward7/ward7.html';
  const shot = process.argv[3] || 'arm.png';
  const fov  = process.argv[4] !== undefined ? +process.argv[4] : 0;
  const bg   = process.argv[5] !== undefined ? +process.argv[5] : 90;
  const pose = process.argv[6] || 'game';
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
           '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox']
  });
  const page = await browser.newPage({ viewport: { width: 720, height: 1280 } });
  const errs = [];
  page.on('pageerror', e => errs.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CONSOLE ' + m.text()); });
  await page.route('**/three.min.js', r =>
    r.fulfill({ status: 200, contentType: 'application/javascript',
                body: fs.readFileSync(path.join(__dirname, 'three.min.js'), 'utf8') }));

  await page.goto('file://' + file + '?debug=1', { waitUntil: 'load' });
  await page.waitForFunction('!!window.__WARD7', { timeout: 20000 });

  await page.evaluate(async (o) => {
    const A = window.__WARD7;
    A.skipUI(true); A.seed(7); A.settings.quality = 3; A.start();
    await new Promise(r => setTimeout(r, 1000));
    const g = A.gfx();
    /* 揺れと粒子を止める。止めないと引き算の差分が画面じゅうに出て
       腕の形が取り出せない（埃と粒子だけで 8 割の画素が動いていた）。 */
    A.cheats.noShake = true; A.cheats.freeze = true;
    g.scene.visible = false;
    g.renderer.setClearColor(o.bg * 65536 + o.bg * 256 + o.bg, 1);
    if (o.fov > 0) { g.viewCam.fov = o.fov; g.viewCam.updateProjectionMatrix(); }
    if (o.pose !== 'game') {
      /* viewArm は毎フレーム揺れで上書きされる。触るなら viewRig 側
         （resize でしか触られない）。ランプの原点まわりに回し、
         回した先を画面中央の一定距離へ置き直す。 */
      const rig = A.viewRigRef(), rt = A.viewPartsRef().root.position.clone();
      const ang = { side: Math.PI * 0.42, top: 0, front: Math.PI }[o.pose] || 0;
      rig.rotation.set(o.pose === 'top' ? -Math.PI * 0.42 : 0, ang, 0);
      const p = rt.clone().applyEuler(rig.rotation);
      rig.position.set(-p.x, -p.y, -0.34 - p.z);
    }
    await new Promise(r => setTimeout(r, 400));
  }, { fov, bg, pose });

  const buf = await page.locator('canvas').first().screenshot();
  fs.writeFileSync(shot, buf);

  // 描いた画素をそのまま読む（合成後に無効化されるので rAF の中で）
  const grab = () => page.evaluate(() => new Promise(res => {
    requestAnimationFrame(() => {
      const cv = document.querySelector('canvas');
      const gl = cv.getContext('webgl2') || cv.getContext('webgl');
      const px = new Uint8Array(cv.width * cv.height * 4);
      gl.readPixels(0, 0, cv.width, cv.height, gl.RGBA, gl.UNSIGNED_BYTE, px);
      res(Array.from(px));
    });
  }));

  const withArm = await grab();
  await page.evaluate(() => { window.__WARD7.viewArm().visible = false; });
  await page.waitForTimeout(300);
  const noArm = await grab();
  await browser.close();

  const L = [];
  for (let i = 0; i < withArm.length; i += 4) {
    const d = Math.abs(withArm[i] - noArm[i]) + Math.abs(withArm[i + 1] - noArm[i + 1]) +
              Math.abs(withArm[i + 2] - noArm[i + 2]);
    if (d < 12) continue;                       // 腕が写っていない画素
    L.push(withArm[i] * 0.299 + withArm[i + 1] * 0.587 + withArm[i + 2] * 0.114);
  }
  const tot = withArm.length / 4, n = L.length;
  console.log(`${shot} pose=${pose} fov=${fov || 'game'}`);
  if (!n) { console.log('  腕が一画素も写っていない'); process.exit(1); }
  L.sort((a, b) => a - b);
  const mean = L.reduce((a, b) => a + b, 0) / n;
  let v = 0; for (let i = 0; i < n; i++) v += (L[i] - mean) * (L[i] - mean);
  console.log(`  腕の面積 ${(n / tot * 100).toFixed(1)}%  平均輝度 ${mean.toFixed(1)}  ` +
              `散らばり ${Math.sqrt(v / n).toFixed(1)}  ` +
              `5/50/95分位 ${L[(n * 0.05) | 0].toFixed(0)}/${L[(n * 0.5) | 0].toFixed(0)}/${L[(n * 0.95) | 0].toFixed(0)}`);
  if (errs.length) { console.log('  エラー ' + errs.length); errs.slice(0, 6).forEach(e => console.log('   ! ' + e.slice(0, 180))); }
})();

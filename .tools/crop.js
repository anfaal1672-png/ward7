/* PNG の切り出しと拡大。外部依存を増やさないよう Chromium の canvas を使う
   （pngjs も ImageMagick もこの環境には無い）。
   使い方: node crop.js <src.png> <dst.png> <X> <Y> <W> <H> [倍率] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [,,src,dst,X,Y,W,H,S] = process.argv;
  const sc = +(S || 1);
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--no-sandbox'] });
  const p = await b.newPage();
  const data = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
  const out = await p.evaluate(async ([data, x, y, w, h, sc]) => {
    const img = new Image();
    await new Promise(r => { img.onload = r; img.src = data; });
    const c = document.createElement('canvas');
    c.width = Math.round(w*sc); c.height = Math.round(h*sc);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = sc < 1;      // 拡大は補間しない（粗を隠さない）
    g.drawImage(img, x, y, w, h, 0, 0, c.width, c.height);
    return { url:c.toDataURL('image/png'), w:c.width, h:c.height };
  }, [data, +X, +Y, +W, +H, sc]);
  fs.writeFileSync(dst, Buffer.from(out.url.split(',')[1], 'base64'));
  console.log('ok', dst, out.w + 'x' + out.h);
  await b.close();
})();

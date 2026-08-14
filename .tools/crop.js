// PNG の切り出しと拡大。外部依存を増やさないよう Chromium の canvas を使う
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs = require('fs');
(async () => {
  const [,,src,dst,X,Y,W,H,S] = process.argv;
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const p = await b.newPage();
  const data = 'data:image/png;base64,' + fs.readFileSync(src).toString('base64');
  const out = await p.evaluate(async ([d,x,y,w,h,s]) => {
    const im = new Image(); im.src = d; await im.decode();
    const c = document.createElement('canvas'); c.width = w*s; c.height = h*s;
    const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.drawImage(im, x, y, w, h, 0, 0, w*s, h*s);
    return c.toDataURL('image/png');
  }, [data, +X, +Y, +W, +H, +(S||1)]);
  fs.writeFileSync(dst, Buffer.from(out.split(',')[1], 'base64'));
  console.log('ok', dst, (W*(S||1))+'x'+(H*(S||1)));
  await b.close();
})();

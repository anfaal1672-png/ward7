/* タイトル画面のキャンバスは Playwright のスクリーンショットに合成されない。
   readPixels では中身が取れるので、その配列を 2D キャンバスへ描き戻して
   PNG にする（上下が逆なので反転する）。これで実機を待たずに確認できる。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.waitForTimeout(+(process.argv[4]||3000));
  const data = await p.evaluate(()=>new Promise(res=>{
    requestAnimationFrame(()=>{
      const cv=document.querySelector('canvas');
      const gl=cv.getContext('webgl2')||cv.getContext('webgl');
      const w=cv.width, h=cv.height, px=new Uint8Array(w*h*4);
      gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
      const c2=document.createElement('canvas'); c2.width=w; c2.height=h;
      const g2=c2.getContext('2d');
      const im=g2.createImageData(w,h);
      for(let y=0;y<h;y++){                       // 上下反転
        const src=(h-1-y)*w*4, dst=y*w*4;
        for(let x=0;x<w*4;x++) im.data[dst+x]=px[src+x];
        for(let x=3;x<w*4;x+=4) im.data[dst+x]=255;
      }
      g2.putImageData(im,0,0);
      res(c2.toDataURL('image/png'));
    });
  }));
  fs.writeFileSync(process.argv[3], Buffer.from(data.split(',')[1],'base64'));
  console.log('タイトル背景を書き出した', process.argv[3], 'err', errs.length);
  await b.close();
})();

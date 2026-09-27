/* 手続きテクスチャを 1 枚の PNG に落とす。__WARD7.texGen を使う。
   使い方: node texshow.js <html> <wall|floor> <out.png> [size] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:600,height:600}});
  await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync('/home/user/ward7/.tools/three.min.js','utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const data=await p.evaluate(([which,size])=>{
    const A=window.__WARD7;
    const c=A.texGen[which](size);
    return c.toDataURL('image/png');
  },[process.argv[3], +(process.argv[5]||512)]);
  fs.writeFileSync(process.argv[4], Buffer.from(data.split(',')[1],'base64'));
  console.log('ok', process.argv[4]);
  await b.close();
})();

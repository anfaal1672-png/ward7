/* タイトルの UI を撮る。キャンバスは合成されないので黒く写るが、
   文字と余白の配置はこれで確認できる。3D の中身は title-capture.js。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844}, deviceScaleFactor:2});
  await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync('/home/user/ward7/.tools/three.min.js','utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.waitForTimeout(1500);
  await p.screenshot({path:process.argv[3]||'titleui.png'});
  console.log('ok');
  await b.close();
})();

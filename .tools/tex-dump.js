const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:600,height:600}});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const data = await p.evaluate(async(which)=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,500));
    // TEX は公開していないので、材質から辿る
    let tex=null;
    A.world.group.traverse(o=>{ if(o.isMesh && o.material && o.material.map && o.material.transparent && o.material.depthWrite===false && !tex) tex=o.material.map; });
    if(!tex) return null;
    const im=tex.image, c=document.createElement('canvas');
    c.width=im.width; c.height=im.height;
    const g=c.getContext('2d');
    g.fillStyle='#8a8f86'; g.fillRect(0,0,c.width,c.height);   // 壁の色を下に敷く
    g.drawImage(im,0,0);
    return c.toDataURL('image/png');
  }, 0);
  if(data){ fs.writeFileSync(process.argv[3], Buffer.from(data.split(',')[1],'base64')); console.log('dumped', process.argv[3]); }
  else console.log('材質が見つからない');
  await b.close();
})();

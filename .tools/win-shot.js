/* 脱出の演出を撮る。プレイヤーを非常口の手前へ運び、扉を開けて doWin を通す。
   使い方: node .tools/win-shot.js <html> [接頭辞] */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs');
(async()=>{
  const file=process.argv[2]||'/home/user/ward7/ward7.html';
  const pre=process.argv[3]||'win';
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync('/home/user/ward7/.tools/three.min.js','utf8')}));
  await p.goto('file://'+file+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(async()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,700));
    const W=A.world,P=A.player;
    W.exit.open = true;                      // 扉を開けた状態にする
    /* 施錠扉は「開く」と板ごと消える。ここを消し忘れると、非常口の
       手前に立ったつもりでも視界いっぱいが施錠扉になる（実際そうなった）。 */
    if(W.lockDoor){ W.lockDoor.open = true; W.lockDoor.group.visible = false; }
    // 非常口の 4m 手前、扉のほうを向かずに立たせる（向き直る演出を見るため）
    const dx=W.exit.doorX-W.exit.x, dz=W.exit.doorZ-W.exit.z, L=Math.hypot(dx,dz)||1;
    P.x = W.exit.x - (dx/L)*4.0; P.z = W.exit.z - (dz/L)*4.0;
    P.yaw = Math.atan2(-dx/L,-dz/L) + 1.1; P.viewYaw = P.yaw; P.pitch = 0;
    await new Promise(r=>setTimeout(r,300));
    A.act('win');                            // チートの「脱出」
  });
  for(const [ms,name] of [[520,'a'],[500,'b'],[380,'c']]){
    await p.waitForTimeout(ms);
    await p.locator('canvas').first().screenshot({path:`${pre}_${name}.png`});
  }
  console.log('撮影 err', errs.length); errs.slice(0,3).forEach(e=>console.log(' !',e.slice(0,140)));
  await b.close();
})();

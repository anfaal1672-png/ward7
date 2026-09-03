/* 追跡者だけの画素を確実に測る。
   画面上の矩形を決め打ちすると腕やランプが混ざる（一度それで、
   albedo を半分にしても数値が動かないという嘘の結論を出した）。
   出した状態と消した状態の差でマスクを取ろうとしたが、粒子ノイズ・埃・
   ランプのちらつきで画面の 81% が「差あり」になって使えなかった。
   腕とランプを消して、投影した胴の周りだけを測る。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
const grab = `(()=>new Promise(res=>{ requestAnimationFrame(()=>{
  const cv=document.querySelector('canvas');
  const gl=cv.getContext('webgl2')||cv.getContext('webgl');
  const w=cv.width,h=cv.height,px=new Uint8Array(w*h*4);
  gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);
  res({w:w,h:h,d:Array.from(px)});
});}))()`;
(async()=>{
  const file=process.argv[2], q=+(process.argv[3]||3), out=process.argv[4], dist=+(process.argv[5]||3.5);
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+file+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(async ({q,dist})=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=q; A.start();
    await new Promise(r=>setTimeout(r,700));
    const P=A.player, Hn=A.hunter, cam=A.camera, THREE=window.THREE;
    const fwd=new THREE.Vector3(); cam.updateMatrixWorld(true); cam.getWorldDirection(fwd);
    fwd.y=0; fwd.normalize();
    Hn.x=P.x+fwd.x*dist; Hn.z=P.z+fwd.z*dist;
    /* 追跡者を停止させる（チートの freeze）。動いたままだと、撮る瞬間に
       どこに居るか決まらない。粒子ノイズと画面揺れも止める。 */
    A.cheats.freeze = true; A.cheats.noShake = true;
    Hn.spawnGrace = 0; Hn.mode='hunt';
    window.__show=true;
    window.__pin=setInterval(()=>{
      Hn.x=P.x+fwd.x*dist; Hn.z=P.z+fwd.z*dist;
      Hn.group.visible=window.__show; if(Hn.shadow) Hn.shadow.visible=window.__show;
      Hn.group.position.set(Hn.x, Hn.group.position.y, Hn.z);
      Hn.group.rotation.y=Math.atan2(-fwd.x,-fwd.z)+Math.PI;
    }, 6);
    await new Promise(r=>setTimeout(r,800));
    const v=new THREE.Vector3(Hn.x, 1.30, Hn.z).project(cam);
    const cv=document.querySelector('canvas');
    window.__box=[(v.x*0.5+0.5)*cv.width, (v.y*0.5+0.5)*cv.height];
  }, {q,dist});
  const box = await p.evaluate(()=>window.__box);
  const on = await p.evaluate(grab);
  if(out) await p.locator('canvas').first().screenshot({path:out});
  await p.evaluate(()=>{ window.__show=false; });
  await p.waitForTimeout(400);
  const off = await p.evaluate(grab);
  await b.close();
  /* freeze と noShake で場面が止まっているので、出した状態と消した状態の差が
     そのまま追跡者のシルエットになる（止めずにやると埃と粒子ノイズで
     画面の 81% が「差あり」になって使い物にならない）。 */
  const {w,h}=on, A2=on.d, B=off.d;
  let n=0,r=0,g=0,bl=0,clip=0, wn=0,wr=0,wg=0,wb=0;
  for(let i=0;i<A2.length;i+=4){
    const df=Math.abs(A2[i]-B[i])+Math.abs(A2[i+1]-B[i+1])+Math.abs(A2[i+2]-B[i+2]);
    if(df>28){ n++; r+=A2[i]; g+=A2[i+1]; bl+=A2[i+2];
      if(A2[i]>=248&&A2[i+1]>=248&&A2[i+2]>=248) clip++; }
    else { const y=(i/4/w)|0; if(y>h*0.38 && y<h*0.60){ wn++; wr+=B[i]; wg+=B[i+1]; wb+=B[i+2]; } }
  }
  const lum=(x,y,z)=>0.299*x+0.587*y+0.114*z;
  const hl=lum(r/n,g/n,bl/n), bg=lum(wr/wn,wg/wn,wb/wn);
  console.log(`${path.basename(file).padEnd(16)} q${q} d${dist}  追跡者 画素${n} rgb=${[r/n|0,g/n|0,bl/n|0]} 輝度${hl.toFixed(1)} 白飛び${(clip/n*100).toFixed(1)}%  背景 輝度${bg.toFixed(1)}  比 ${(hl/bg).toFixed(2)}倍  err=${errs.length}`);
})();

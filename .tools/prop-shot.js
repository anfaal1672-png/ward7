/* 小物の実際の画素を測る。投影して矩形を置く方法は当たらなかったので、
   場面を止めたまま素材だけ黒に差し替えて撮り直し、差が出た画素＝小物とする。 */
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const fs=require('fs'), path=require('path');
const grab=`(()=>new Promise(res=>{requestAnimationFrame(()=>{const cv=document.querySelector('canvas');
 const gl=cv.getContext('webgl2')||cv.getContext('webgl');const w=cv.width,h=cv.height,d=new Uint8Array(w*h*4);
 gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,d);res({w,h,d:Array.from(d)});});}))()`;
(async()=>{
  const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:720,height:1280}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'three.min.js'),'utf8')}));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  await p.evaluate(async()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(7); A.settings.quality=3; A.start();
    await new Promise(r=>setTimeout(r,600));
    A.cheats.freeze=true; A.cheats.noShake=true;
    const P=A.player, cam=A.camera, THREE=window.THREE;
    cam.updateMatrixWorld(true);
    const f=new THREE.Vector3(); cam.getWorldDirection(f); f.y=0; f.normalize();
    const rt=new THREE.Vector3(-f.z,0,f.x);
    const kinds=[]; A.world.group.traverse(o=>{ if(o.isInstancedMesh&&o.count>0&&o.geometry.attributes.color) kinds.push(o); });
    window.__k=kinds;
    const dm=new THREE.Object3D();
    setInterval(()=>{ kinds.forEach((im,i)=>{
      const side=(i-(kinds.length-1)/2)*1.4;
      dm.position.set(P.x+f.x*3.2+rt.x*side, 0.52, P.z+f.z*3.2+rt.z*side);
      dm.rotation.set(0, Math.atan2(-f.x,-f.z)+0.5,0); dm.scale.set(1,1,1); dm.updateMatrix();
      im.setMatrixAt(0, dm.matrix); im.instanceMatrix.needsUpdate=true; }); },8);
    await new Promise(r=>setTimeout(r,900));
  });
  const on = await p.evaluate(grab);
  await p.locator('canvas').first().screenshot({path:process.argv[3]||'pm.png'});
  await p.evaluate(()=>{ const m=window.__k[0].material; m.vertexColors=false; m.color.setHex(0x000000); m.needsUpdate=true; });
  await p.waitForTimeout(400);
  const off = await p.evaluate(grab);
  await b.close();
  let n=0,r=0,g=0,bl=0,clip=0;
  for(let i=0;i<on.d.length;i+=4){
    const df=Math.abs(on.d[i]-off.d[i])+Math.abs(on.d[i+1]-off.d[i+1])+Math.abs(on.d[i+2]-off.d[i+2]);
    if(df>25){ n++; r+=on.d[i]; g+=on.d[i+1]; bl+=on.d[i+2];
      if(on.d[i]>=245&&on.d[i+1]>=245&&on.d[i+2]>=245) clip++; }
  }
  console.log(`${path.basename(process.argv[2]).padEnd(14)} 小物の画素 ${n}  rgb=${[r/n|0,g/n|0,bl/n|0]}  白飛び${(clip/n*100).toFixed(1)}%  err=${errs.length}`);
})();

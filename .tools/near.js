// 見つかっていない段階で相手へ近づく動きの割合と、最接近距離の分布
const H=require('./harness.js'); const A=H.window.__WARD7;
let o={calm:0,toward:0,near8:0,near5:0,t:0};
for(const sd of process.argv.slice(2).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player,h=A.hunter,b=A.bot; let f=0;
  while(A.state()===2 && f<800*60){
    const x0=p.x,z0=p.z; H.pump(6); f+=6;
    if(p.hiding || b.fleeT>0) continue;
    const th=(b.ear.vol<=0.006)?0:Math.min(1,(b.ear.vol-0.006)/0.26);
    const step=(p.time-b.ear.stepT)<2.5;
    o.t+=0.1;
    const hd=Math.hypot(h.x-p.x,h.z-p.z);
    if(hd<8) o.near8+=0.1; if(hd<5) o.near5+=0.1;
    if(th<=0.05 && !step) continue;
    const vx=p.x-x0, vz=p.z-z0, vl=Math.hypot(vx,vz);
    if(vl<0.01||hd<0.01) continue;
    o.calm+=0.1;
    if((vx/vl)*((h.x-p.x)/hd)+(vz/vl)*((h.z-p.z)/hd)>0.5) o.toward+=0.1;
  }
}
console.log(JSON.stringify(o));

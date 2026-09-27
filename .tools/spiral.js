// 被弾の瞬間の状態と、追われている間の失速の中身
const H=require('./harness.js'); const A=H.window.__WARD7;
let o={hit:0,stam:0,blown:0,lampOff:0,lowhp:0,slow:0,fleeT:0,fleeBlown:0,fleeSlow:0,fleeWalkSpd:0,n:0,hit4:0,hit1:0};
for(const sd of process.argv.slice(2).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player,b=A.bot; let hp=100,f=0,nh=0;
  while(A.state()===2 && f<800*60){
    const x0=p.x,z0=p.z; H.pump(6); f+=6;
    const sp=Math.hypot(p.x-x0,p.z-z0)/0.1;
    if(b.fleeT>0 && !p.hiding){ o.fleeT+=0.1; if(b.blown) o.fleeBlown+=0.1; if(sp<3.4) o.fleeSlow+=0.1; o.fleeWalkSpd+=sp*0.1; o.n++; }
    if(p.hp<hp){
      nh++; o.hit++; o.stam+=p.stamina;
      if(b.blown) o.blown++;
      if(!p.lamp) o.lampOff++;
      if(hp<40) o.lowhp++;
      if(sp<3.4) o.slow++;
      if(nh===1) o.hit1++; if(nh===4) o.hit4++;
      hp=p.hp;
    }
  }
}
console.log(JSON.stringify(o));

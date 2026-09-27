// 被弾の 3 秒前は何が起きていたか
const H=require('./harness.js'); const A=H.window.__WARD7;
let o={hit:0,noflee:0,d3sum:0,d3near:0,corner:0,hiding:0,blocked:0,turn:0,fleeAge:0,nAge:0};
for(const sd of process.argv.slice(2).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player,h=A.hunter,b=A.bot; let hp=100,f=0;
  const buf=[];
  while(A.state()===2 && f<800*60){
    H.pump(6); f+=6;
    buf.push({d:Math.hypot(h.x-p.x,h.z-p.z), flee:b.fleeT>0, hide:!!p.hiding, blk:p.blockedT>0.15});
    if(buf.length>40) buf.shift();
    if(p.hp<hp){
      hp=p.hp; o.hit++;
      const k=Math.max(0,buf.length-31);        // 3 秒前
      const s=buf[k];
      o.d3sum+=s.d; if(s.d<6) o.d3near++;
      if(s.hide) o.hiding++;
      if(!s.flee) o.noflee++;
      if(buf.slice(k).some(x=>x.blk)) o.blocked++;
      // 追われ始めてからの経過（直近で flee でなかった時点を探す）
      let age=0; for(let i=buf.length-1;i>=0;i--){ if(!buf[i].flee) break; age+=0.1; }
      o.fleeAge+=age; o.nAge++;
      buf.length=0;
    }
  }
}
console.log(JSON.stringify(o));

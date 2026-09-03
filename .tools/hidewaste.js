// 「隠れる」と言って箱へ向かった回数のうち、実際に入れた割合と、
// 入れなかったぶんに費やした時間
const H=require('./harness.js'); const A=H.window.__WARD7;
const F=process.env.WARD7_FILE;
let o={tries:0,ok:0,waste:0,total:0};
for(const sd of process.argv.slice(2).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player,b=A.bot; let f=0, run=0, inTry=false, got=false;
  while(A.state()===2 && f<800*60){
    H.pump(6); f+=6; o.total+=0.1;
    const going = (b.note==='隠れる');
    if(going){ if(!inTry){ inTry=true; run=0; got=false; o.tries++; } run+=0.1; if(p.hiding) got=true; }
    else if(inTry){
      if(got) o.ok++; else o.waste+=run;
      inTry=false;
    }
  }
}
console.log(JSON.stringify(o));

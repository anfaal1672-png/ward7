const H=require('./harness.js'); const A=H.window.__WARD7;
function run(mode, sd){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.playAs(mode); A.botOn(true);
  A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player; let f=0, dist=0, x=p.x, z=p.z;
  while(A.state()===2 && f<400*60){
    if(mode==='hunter'){ A.hunterIn.fwd=0; A.hunterIn.side=0; A.hunterIn.run=false; }
    H.pump(6); f+=6; dist+=Math.hypot(p.x-x,p.z-z); x=p.x; z=p.z;
  }
  return {mode, sd, got:p.got+'/'+p.need, t:+p.time.toFixed(0), dist:+dist.toFixed(0),
          out:A.state()===5?'C':(A.state()===4?'d':'t'), key:p.hasKey};
}
for(const sd of [9200,9201]){ console.log(JSON.stringify(run('survivor',sd))); console.log(JSON.stringify(run('hunter',sd))); }

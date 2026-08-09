const H=require('./harness.js'); const A=H.window.__WARD7;
const args=process.argv.slice(2).map(Number);
function warm(sd){ A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  let f=0; while(A.state()===2 && f<800*60){ H.pump(30); f+=30; } }
if(args.length>1) warm(args[0]);
A.toTitle(); A.skipUI(true); A.seed(args[args.length-1]); A.botOn(true); A.settings.diff=0; A.start();
const p=A.player,b=A.bot,inp=A.input;
function snap(tag){
  const o={tag};
  for(const k in b){ const v=b[k]; if(typeof v==='number') o['B.'+k]=+v.toFixed(6); else if(typeof v==='boolean'||typeof v==='string') o['B.'+k]=v; }
  for(const k in b.ear){ const v=b.ear[k]; if(typeof v==='number') o['E.'+k]=+v.toFixed(6); else o['E.'+k]=v; }
  for(const k of ['x','z','yaw','pitch','vx','vz','viewYaw','stamina','battery','bob','stepAcc','blockedT'])
    o['P.'+k]=+p[k].toFixed(6);
  o['I.lookX']=+inp.lookX.toFixed(6); o['I.fwd']=+inp.fwd.toFixed(6); o['I.side']=+inp.side.toFixed(6);
  o['I.keys']=Object.keys(inp.keys).filter(k=>inp.keys[k]).join(',');
  console.log(JSON.stringify(o));
}
for(let i=0;i<200;i++){ H.pump(1); snap(i); }

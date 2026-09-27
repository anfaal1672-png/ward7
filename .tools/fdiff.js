const H=require('./harness.js'); const A=H.window.__WARD7;
const sd=+process.argv[2];
H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
const p=A.player,b=A.bot,inp=A.input;
for(let i=0;i<9000;i++){
  H.pump(1);
  if(A.state()!==2) break;
  console.log([i,p.x.toFixed(5),p.z.toFixed(5),p.yaw.toFixed(5),
    (b.goal&&b.goal.kind)||'-', b.fleeT.toFixed(2),
    (inp.keys.KeyW?'W':'')+(inp.keys.KeyA?'A':'')+(inp.keys.KeyD?'D':'')+(inp.keys.ShiftLeft?'S':''),
    p.lamp?1:0].join(' '));
}

// 追う側で本当に捕まえられるか。追跡者を相手へ向かわせ続ける単純な操作で試す。
const H=require('./harness.js'); const A=H.window.__WARD7;
H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(+process.argv[2]||9200); A.playAs('hunter'); A.botOn(true);
A.settings.diff=0; A.start(); H.pump(2);
const p=A.player,h=A.hunter;
let hits=0,hp0=p.hp,f=0,minD=1e9;
while(A.state()===2 && f<400*60){
  const want=Math.atan2(-(p.x-h.x),-(p.z-h.z));
  let e=((want-h.yaw+Math.PI*3)%(Math.PI*2))-Math.PI;
  A.input.lookX = -e*260;              // 相手の方へ視点を振る（人間の操作の代わり）
  A.humanKeys.KeyW=true; A.humanKeys.ShiftLeft=true;
  H.pump(6); f+=6;
  const d=Math.hypot(p.x-h.x,p.z-h.z); if(d<minD) minD=d;
  if(p.hp<hp0){ hits++; hp0=p.hp; }
}
console.log(JSON.stringify({seed:+process.argv[2]||9200, 状態:A.state()===4?'捕らえた':(A.state()===5?'逃げられた':'決着なし'),
  被弾:hits, 最接近:+minD.toFixed(2), 時間:+p.time.toFixed(0), カルテ:p.got+'/'+p.need}));

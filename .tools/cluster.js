// 被弾は「散らばって起きる」のか「一度の遭遇でまとめて起きる」のか
const H=require('./harness.js'); const A=H.window.__WARD7;
for(const sd of process.argv.slice(2).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=0; A.start(); H.pump(2);
  const p=A.player; let hp=100,f=0; const times=[];
  while(A.state()===2 && f<800*60){ H.pump(6); f+=6; if(p.hp<hp){ times.push(+p.time.toFixed(1)); hp=p.hp; } }
  console.log(JSON.stringify({sd,out:A.state()===5?'C':(A.state()===4?'d':'t'),t:+p.time.toFixed(0),times}));
}

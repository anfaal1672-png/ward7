const H=require('./harness.js'); const A=H.window.__WARD7;
const D=+process.argv[2], CAP=+(process.env.CAP||800);
for(const sd of process.argv.slice(3).map(Number)){
  H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=D; A.start(); H.pump(2);
  const p=A.player;
  let hp=100, hits=0, f=0;
  while(A.state()===2 && f<CAP*60){ H.pump(30); f+=30; if(p.hp<hp){ hits++; hp=p.hp; } }
  const st=A.state();
  var stage = p.got < p.need ? ('カルテ'+p.got+'/'+p.need) : (!p.hasKey ? '鍵' : '出口へ');
  console.log(JSON.stringify({seed:sd, out: st===5?'C':(st===4?'d':'t'), t:+p.time.toFixed(1),
    hits, got:p.got, stage, hp:Math.round(p.hp)}));
}

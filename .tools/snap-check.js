/* 状態の保存と巻き戻し（設計指示書 第 15.3 節）。ボットに 30 秒遊ばせて状態を取り、20 秒進めた
   跡と、戻して同じだけ進めた跡が 1 本残らず同じになることを見る（写し漏れがあれば食い違う）。
   ハーネス（jsdom）で回す。使い方: node .tools/snap-check.js [章の添字=0] [種…] */
const H=require('./harness.js'); const A=H.window.__WARD7;
const ch=+(process.argv[2]||0), seeds=(process.argv.slice(3).length ? process.argv.slice(3) : ['9200','9201','9202']).map(Number);
let bad=0;
for(const sd of seeds){
  A.run.ch = ch; H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(sd); A.botOn(true); A.settings.diff=1; A.start(); H.pump(2);
  H.pump(1800);
  if(A.state()!==2){ console.log(sd, '30 秒までに終わった（飛ばす）'); continue; }
  const snap = A.snapTake();
  const trace = ()=>{ const out=[]; for(let f=0; f<1200 && A.state()===2; f+=15){ H.pump(15);
    const p=A.player, h=A.hunter; out.push([f, p.x.toFixed(4), p.z.toFixed(4), h.x.toFixed(4), h.z.toFixed(4), h.mode, p.got, Math.round(p.hp)].join(',')); }
    out.push('end,'+A.state()); return out; };
  const a = trace();
  A.snapRestore(snap);
  const b = trace();
  let diff = -1; for(let i=0; i<Math.max(a.length,b.length); i++) if(a[i]!==b[i]){ diff=i; break; }
  if(diff<0) console.log(sd, 'OK', a.length, '点が一致', snap.length, 'バイト');
  else { bad++; console.log(sd, 'FAIL 最初の食い違い', '\n  取った後:', a[diff], '\n  戻した後:', b[diff]); }
}
console.log(bad ? 'FAIL' : 'OK'); process.exit(bad?1:0);

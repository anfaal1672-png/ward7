const fs=require('fs');
const rows=fs.readFileSync(process.argv[2],'utf8').trim().split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
const C=rows.filter(r=>r.out==='C'), L=rows.filter(r=>r.out!=='C');
const T=rows.reduce((s,r)=>s+r.t,0), H=rows.reduce((s,r)=>s+r.hits,0), G=rows.reduce((s,r)=>s+r.got,0);
const med=a=>a.length?a.slice().sort((x,y)=>x-y)[a.length>>1].toFixed(0):'-';
console.log(`${rows.length}本  クリア ${C.length} (${(C.length/rows.length*100).toFixed(1)}%)  死亡 ${rows.filter(r=>r.out==='d').length}  時間切れ ${rows.filter(r=>r.out==='t').length}`);
console.log(`被弾 ${(H/T*100).toFixed(2)}/100s  カルテ/被弾 ${(G/H).toFixed(3)}  クリア時間 中央値 ${med(C.map(r=>r.t))}s`);
const st={}; L.forEach(r=>st[r.stage]=(st[r.stage]||0)+1);
Object.entries(st).sort((a,b)=>b[1]-a[1]).slice(0,4).forEach(([k,v])=>console.log(`  ${String(Math.round(v/L.length*100)).padStart(3)}%  ${k}`));

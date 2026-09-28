/* 章ごとのボット結果（runall2.sh の出力）から、設計指示書 第 5.6 節の目標を判定する。
   目標：通常で各章のクリア率 30〜50%、章どうしの差 20 ポイント以内。
   使い方: node balance-judge.js <出力ファイル…>  （ファイル名に ch<番号> を含める） */
const fs=require('fs');
const LO=30, HI=50, GAP=20;
const res=process.argv.slice(2).map(f=>{
  const rows=fs.readFileSync(f,'utf8').split('\n').filter(l=>l.startsWith('{')).map(l=>JSON.parse(l));
  const c=rows.filter(r=>r.out==='C').length;
  return { ch:+(f.match(/ch(\d+)/)||[0,-1])[1], n:rows.length, rate:rows.length ? c/rows.length*100 : NaN };
}).sort((a,b)=>a.ch-b.ch);
const rates=res.map(r=>r.rate), gap=Math.max(...rates)-Math.min(...rates);
let ok=res.length>0, out=['| 章 | 本数 | クリア率 | 判定 |','|---|---|---|---|'];
for(const r of res){
  const good = r.n>0 && r.rate>=LO && r.rate<=HI; if(!good) ok=false;
  out.push(`| 第${r.ch+1}章 | ${r.n} | ${r.rate.toFixed(1)}% | ${good?'✅':'❌ 目標 '+LO+'〜'+HI+'%'} |`);
}
if(!(gap<=GAP)) ok=false;
out.push('', `章の差 ${gap.toFixed(1)} ポイント（目標 ${GAP} 以内）${gap<=GAP?' ✅':' ❌'}`);
console.log(out.join('\n'));
if(process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, '## ボットのクリア率（通常・240 本）\n\n'+out.join('\n')+'\n');
process.exit(ok?0:1);

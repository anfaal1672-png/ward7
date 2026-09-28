/* 型の締め具合の歯止め（設計指示書 第 15.2 節 手順 2「any から始め、章ごとに締める」）。
   源（game/src/ts/*.ts）を tsc --noImplicitAny で検め、型の無い引数・変数・戻り値の数を章（源のファイル）
   ごとに数える。控え（any-baseline.json）より増えた章があれば落とす。減ったら --update で控えを下げる。
   こうして一度締めた章は緩まない。使い方: node .tools/any-ratchet.js [--update] */
const fs=require('fs'), path=require('path'), { execFileSync }=require('child_process');
const root=path.join(__dirname,'..'), base=path.join(__dirname,'any-baseline.json');
let out=''; try{ out=execFileSync(path.join(root,'node_modules','.bin','tsc'), ['-p', path.join(root,'tsconfig.json'), '--noImplicitAny'], {encoding:'utf8', maxBuffer:1<<26}); }catch(e){ out=e.stdout||''; }
const order=JSON.parse(fs.readFileSync(path.join(root,'game','src','ts','order.json'),'utf8'));
const count={}; order.forEach(f=>count[f]=0);
for(const m of out.matchAll(/game\/src\/ts\/([^(]+)\(\d+,\d+\): error TS7\d+/g)){
  if(count[m[1]]===undefined){ console.error('order.json に無い源:', m[1]); process.exit(1); }
  count[m[1]]++; }
const total=Object.values(count).reduce((a,b)=>a+b,0);
if(process.argv.includes('--update')){ fs.writeFileSync(base, JSON.stringify(count, null, 1)+'\n'); console.log('控えを書いた。合計', total); process.exit(0); }
const B=fs.existsSync(base) ? JSON.parse(fs.readFileSync(base,'utf8')) : {};
let bad=0;
for(const f of order){ const b=B[f]===undefined ? Infinity : B[f], c=count[f];
  const mark = c>b ? '✗ 増えた' : (c<b ? '↓ 減った（--update で控えを下げる）' : (c===0 ? '✓ 締め済み' : ''));
  if(c>b) bad++; console.log(f.padEnd(26), String(c).padStart(4), mark); }
console.log('合計', total, bad ? 'FAIL' : 'OK'); process.exit(bad?1:0);

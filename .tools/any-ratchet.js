/* 型の締め具合の歯止め（設計指示書 第 15.2 節 手順 2「any から始め、章ごとに締める」）。
   組み立てた後のスクリプトを tsc --noImplicitAny で検め、型の無い引数・変数の数を章（源のファイル）
   ごとに数える。控え（any-baseline.json）より増えた章があれば落とす。減ったら --update で控えを下げる。
   こうして一度締めた章は緩まない。使い方: node .tools/any-ratchet.js [--update] */
const fs=require('fs'), path=require('path'), { execFileSync }=require('child_process');
const root=path.join(__dirname,'..'), base=path.join(__dirname,'any-baseline.json');
execFileSync('node', [path.join(__dirname,'extract.js'), path.join(root,'ward7.html'), path.join(root,'.check','ward7.js')]);
let out=''; try{ out=execFileSync(path.join(root,'node_modules','.bin','tsc'), ['-p', path.join(root,'tsconfig.json'), '--noImplicitAny'], {encoding:'utf8', maxBuffer:1<<26}); }catch(e){ out=e.stdout||''; }
// 行 → 源のファイル
const lines=fs.readFileSync(path.join(root,'.check','ward7.js'),'utf8').split('\n');
const start=lines.findIndex(l=>l.trim()==="'use strict';")+2;       // 1 始まりの行番号で js の頭
const order=JSON.parse(fs.readFileSync(path.join(root,'game','src','js','order.json'),'utf8'));
const spans=[]; let at=start;
for(const f of order){ let s=fs.readFileSync(path.join(root,'game','src','js',f),'utf8'); if(s.endsWith('\n')) s=s.slice(0,-1);
  const n=s.split('\n').length; spans.push([f, at, at+n-1]); at+=n; }
const count={}; order.forEach(f=>count[f]=0);
for(const m of out.matchAll(/ward7\.js\((\d+),\d+\): error TS7\d+/g)){
  const ln=+m[1], sp=spans.find(s=>ln>=s[1] && ln<=s[2]); if(sp) count[sp[0]]++; }
const total=Object.values(count).reduce((a,b)=>a+b,0);
if(process.argv.includes('--update')){ fs.writeFileSync(base, JSON.stringify(count, null, 1)+'\n'); console.log('控えを書いた。合計', total); process.exit(0); }
const B=fs.existsSync(base) ? JSON.parse(fs.readFileSync(base,'utf8')) : {};
let bad=0;
for(const f of order){ const b=B[f]===undefined ? Infinity : B[f], c=count[f];
  const mark = c>b ? '✗ 増えた' : (c<b ? '↓ 減った（--update で控えを下げる）' : (c===0 ? '✓ 締め済み' : ''));
  if(c>b) bad++; console.log(f.padEnd(26), String(c).padStart(4), mark); }
console.log('合計', total, bad ? 'FAIL' : 'OK'); process.exit(bad?1:0);

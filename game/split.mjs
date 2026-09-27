/* 一度だけ使う切り出し。ward7.html を章ごとのファイルへ分ける。
   振る舞いを変えないことが目的なので、行を 1 文字も動かさない。
   build.mjs で組み戻した結果が元と 1 バイト違わないことを確かめてから使う。
   使い方: node game/split.mjs [ward7.html] */
import fs from 'node:fs';
import path from 'node:path';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = fs.readFileSync(process.argv[2] || path.join(here, '..', 'ward7.html'), 'utf8');
const L = src.split('\n');

const iStyle = L.indexOf('<style>'), iStyleEnd = L.indexOf('</style>');
const iScript = L.indexOf('<script>'), iScriptEnd = L.lastIndexOf('</script>');
if([iStyle, iStyleEnd, iScript, iScriptEnd].some(i => i < 0)) throw new Error('目印が見つからない');

// 包み（(function(){ 'use strict'; と })();）は build 側が付ける。中身だけを切る
if(L[iScript+1] !== '(function(){' || L[iScript+2] !== "'use strict';" || L[iScriptEnd-1] !== '})();')
  throw new Error('IIFE の形が想定と違う');
const body = L.slice(iScript+3, iScriptEnd-1);

// 章の見出し：行頭の「/* ====」と、次の行の「   N. 題」
const heads = [];
for(let i=0; i<body.length; i++){
  if(/^\/\* =+$/.test(body[i]) && /^\s+\d+\.\s/.test(body[i+1] || '')) heads.push(i);
}
const out = path.join(here, 'src');
fs.rmSync(out, { recursive:true, force:true });
fs.mkdirSync(path.join(out, 'js'), { recursive:true });

// 章番号 → ファイル名の語。章の題は日本語なので、ファイル名だけ英語の短い語にする
const SLUG = { 0:'boot', 1:'util', 2:'audio', 3:'textures', 4:'maze', 5:'config', 6:'renderer',
  7:'materials', 8:'world', 9:'hunter', 10:'player', 11:'input', 12:'hud', 13:'screens',
  14:'start', 15:'update', 16:'end', 17:'loop', 18:'selftest', 19:'bot', 20:'startup',
  21:'hunter-mode', 22:'title-scene' };
const order = [];
const pre = body.slice(0, heads[0]);            // 'use strict' と最初の見出しの間（空行）
heads.forEach((h, k) => {
  const end = (k+1 < heads.length) ? heads[k+1] : body.length;
  const m = body[h+1].match(/^\s+(\d+)\.\s*(.*)$/);
  const num = String(m[1]).padStart(2, '0');
  // ファイル名の頭は「並び順」。章番号は並びと一致しない（20 起動 が最後）
  const name = String(k).padStart(2, '0') + '-ch' + num + '-' + (SLUG[+m[1]] || 'part') + '.js';
  let lines = body.slice(h, end);
  if(k === 0) lines = pre.concat(lines);
  fs.writeFileSync(path.join(out, 'js', name), lines.join('\n') + '\n');
  order.push(name);
});
fs.writeFileSync(path.join(out, 'style.css'), L.slice(iStyle+1, iStyleEnd).join('\n') + '\n');
const shell = L.slice(0, iStyle+1).concat(['<!--@style-->'], L.slice(iStyleEnd, iScript+1),
                                          ['<!--@script-->'], L.slice(iScriptEnd));
fs.writeFileSync(path.join(out, 'shell.html'), shell.join('\n'));
fs.writeFileSync(path.join(out, 'js', 'order.json'), JSON.stringify(order, null, 2) + '\n');
console.log('章 ' + order.length + ' 個に分けた');

/* Blender の書き出し（.glb）から、ゲームの上書き（game/src/levels/chN.json）を作る（設計指示書 第 6.4 節）。
   glTF の節点のうち extras.ward7 を持つ物だけを拾う。位置は glTF の (x, 高さ, z) がそのままゲームの世界の座標。
   並びは節点の名前順（書き出すたびに順が変わって差分が荒れないように）。
   使い方: node level-import.js <入力 .glb> <出力 .json> */
const fs = require('fs');
function readGlb(file){
  const b = fs.readFileSync(file);
  if(b.readUInt32LE(0) !== 0x46546c67) throw new Error('glb ではない: ' + file);
  const len = b.readUInt32LE(12), type = b.readUInt32LE(16);
  if(type !== 0x4e4f534a) throw new Error('最初の塊が JSON でない');
  return JSON.parse(b.toString('utf8', 20, 20 + len));
}
function toItem(n){
  const e = n.extras || {}, t = n.translation || [0, 0, 0];
  const it = { kind:e.ward7, x:+t[0].toFixed(2), z:+t[2].toFixed(2) };
  if(it.kind === 'light') it.y = +t[1].toFixed(2);
  for(const k of ['r', 'i']) if(e[k] !== undefined) it[k] = +(+e[k]).toFixed(2);
  for(const k of ['space', 'act', 'text']) if(e[k] !== undefined) it[k] = String(e[k]);
  if(e.once !== undefined) it.once = !!e.once;
  if(e.flicker !== undefined) it.flicker = !!e.flicker;
  if(e.color !== undefined) it.color = parseInt(String(e.color).replace('#', ''), 16);
  return it;
}
const KINDS = ['sound', 'trigger', 'patrol', 'light'];
function importGlb(file){
  const g = readGlb(file);
  const nodes = (g.nodes || []).filter(n => n.extras && KINDS.includes(n.extras.ward7));
  nodes.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return { items:nodes.map(toItem) };
}
module.exports = { importGlb };
if(require.main === module){
  const [inp, out] = process.argv.slice(2);
  const lv = importGlb(inp);
  fs.writeFileSync(out, JSON.stringify(lv, null, 1) + '\n');
  console.log(out, '印', lv.items.length, lv.items.map(i => i.kind).join(','));
}

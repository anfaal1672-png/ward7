/* 同じ種で、品質を変えてから始めても同じ間取りになるか。
   テクスチャ生成が rnd を引くので、種を決めた後に作り直すとずれる。 */
const H=require('./harness.js'); const A=H.window.__WARD7;
function sig(q){
  A.toTitle(); A.skipUI(true); A.seed(7); A.settings.quality=q; A.start(); H.pump(2);
  const g=A.world.grid; let h=0;
  for(let i=0;i<g.length;i++) h=(h*31 + g[i])|0;
  return h+' 出口'+A.world.exit.cell.x+','+A.world.exit.cell.y+' カルテ'+A.world.records.length;
}
const a=sig(3), b=sig(0), c=sig(3);
console.log('q3 :', a); console.log('q0 :', b); console.log('q3再:', c);
console.log(a===c ? '品質を往復しても同じ間取り: OK' : '品質を変えると間取りがずれる: NG');
console.log(a===b ? '品質が違っても同じ間取り: OK' : '品質が違うと間取りがずれる: NG');

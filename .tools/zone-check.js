/* 区画ごとの色調が実際に効いているか、壁の頂点色を区画別に集計して確かめる */
const H=require('./harness.js'); const A=H.window.__WARD7;
A.toTitle(); A.skipUI(true); A.seed(7); A.settings.quality=3; A.start(); H.pump(2);
const g=A.world.walls.geometry, p=g.attributes.position, c=g.attributes.color;
const CELL=4.2, GW=31;
const acc={};
for(let i=0;i<p.count;i++){
  const cx=Math.round(p.getX(i)/CELL+15), cy=Math.round(p.getZ(i)/CELL+15);
  const zx=Math.max(0,Math.min(2,Math.floor(cx*3/GW))), zy=Math.max(0,Math.min(2,Math.floor(cy*3/GW)));
  const z=zy*3+zx;
  const a=acc[z]=acc[z]||{n:0,r:0,g:0,b:0};
  a.n++; a.r+=c.getX(i); a.g+=c.getY(i); a.b+=c.getZ(i);
}
Object.keys(acc).sort((x,y)=>x-y).forEach(z=>{
  const a=acc[z];
  console.log('区画'+z, '頂点'+String(a.n).padStart(5),
    'RGB比', (a.r/a.n).toFixed(3), (a.g/a.n).toFixed(3), (a.b/a.n).toFixed(3),
    ' R/G', (a.r/a.g).toFixed(3), ' B/G', (a.b/a.g).toFixed(3));
});

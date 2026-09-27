// テクスチャ生成を単体で回し、解像度ごとに描かれた要素の数を数える。
// 「高精細にしたのに同じ絵を引き伸ばしているだけ」を検出するための計測。
const H=require('./harness.js'); const A=H.window.__WARD7;
A.toTitle(); A.seed(9001); A.start(); H.pump(2);
const doc = H.window.document;
const orig = doc.createElement.bind(doc);
function countFor(fn, size){
  const ops = { fill:0, stroke:0, arc:0, grad:0 };
  doc.createElement = function(tag){
    const el = orig(tag);
    if(tag !== 'canvas') return el;
    const gc = el.getContext.bind(el);
    el.getContext = function(t){
      const ctx = gc(t);
      return new Proxy(ctx, { get(o, k){
        const v = o[k];
        if(typeof v !== 'function') return v;
        return function(){
          if(k === 'fill' || k === 'fillRect') ops.fill++;
          if(k === 'stroke') ops.stroke++;
          if(k === 'arc') ops.arc++;
          if(k === 'createRadialGradient' || k === 'createLinearGradient') ops.grad++;
          return v.apply(o, arguments);
        };
      }});
    };
    return el;
  };
  try{ fn(size); } finally { doc.createElement = orig; }
  return ops;
}
for(const size of [128, 256, 512, 1024]){
  const w = countFor(A.texGen.wall, size), f = countFor(A.texGen.floor, size);
  console.log('辺'+String(size).padStart(5)+
    '  壁: 塗り '+String(w.fill).padStart(5)+' 線 '+String(w.stroke).padStart(4)+' 円 '+String(w.arc).padStart(5)+
    '   床: 塗り '+String(f.fill).padStart(5)+' 線 '+String(f.stroke).padStart(4)+' 円 '+String(f.arc).padStart(5));
}

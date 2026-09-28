/* 小道具の立体素材（設計指示書 第 7.2 節「小道具・人体などの素材」）。
   Poly Haven（CC0）の写真計測の模型を取り寄せ、glTF を node で読んで節点の変換を掛け、
   材質ごとに 1 つへまとめ、位置と UV を 16bit・法線を 8bit に詰めて assets/models/<名前>/ に書く。
   色の絵は Chromium で 512px に落とし、彩度を少し抜いて病棟の色へ寄せる（法線・粗さの絵は持たない：
   モバイルの読み込みと容量を優先）。原本はリポジトリに置かない。出所は assets/LICENSES.md。
   使い方: node .tools/model-bake.js [名前...] */
const { chromium, EXEC } = require('./pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', 'assets', 'models');
const CACHE = process.env.ASSET_CACHE || '/tmp/ward7-asset-cache';
const SPECS = [
  { name:'desk',         id:'metal_office_desk' },
  { name:'clock',        id:'wall_clock' },
  /* 原本は韓国の消火器で、台と点検票に韓国語が書いてある。1987 年の日本の病院に合わせて、
     台の文字と点検票を日本語に描き直す（patch：512px の絵の上の矩形を塗り、文字を置く） */
  { name:'extinguisher', id:'korean_fire_extinguisher_01', patch:{
      0:[ { rect:[10,14,156,44], fill:'#7e2a22', lines:[['消 火 器', 30, '#e8e0cf', 18, 38]] } ],
      2:[ { rect:[12,16,234,316], fill:'#e0dccf', band:[12,16,234,44,'#b0392f'],
            lines:[['消火器点検表', 22, '#f2ece0', 60, 38], ['設置場所　東病棟', 14, '#2a2a28', 24, 80],
                   ['点検日　　点検者　結果', 14, '#2a2a28', 24, 112],
                   ['61.4.2　　佐伯　　良', 15, '#34405a', 24, 140], ['61.10.7　 佐伯　　良', 15, '#34405a', 24, 166],
                   ['62.4.3　　木下　　良', 15, '#34405a', 24, 192], ['62.10.1　 ──', 15, '#34405a', 24, 218]] } ]
  } },
  { name:'medbox',       id:'medical_box' },
  { name:'stool',        id:'metal_stool_01' }
];
function get(url, out){ if(!fs.existsSync(out)) execFileSync('curl', ['-sSL', '-o', out, url]); return out; }
function mul(a, b){ const o = new Array(16).fill(0); for(let i=0;i<4;i++) for(let j=0;j<4;j++) for(let k=0;k<4;k++) o[j*4+i] += a[k*4+i]*b[j*4+k]; return o; }
function trs(n){
  if(n.matrix) return n.matrix.slice();
  const t = n.translation || [0,0,0], r = n.rotation || [0,0,0,1], s = n.scale || [1,1,1];
  const [x,y,z,w] = r;
  const m = [1-2*(y*y+z*z), 2*(x*y+z*w), 2*(x*z-y*w), 0,  2*(x*y-z*w), 1-2*(x*x+z*z), 2*(y*z+x*w), 0,
             2*(x*z+y*w), 2*(y*z-x*w), 1-2*(x*x+y*y), 0,  t[0], t[1], t[2], 1];
  for(let i=0;i<3;i++){ m[i] *= s[0]; m[4+i] *= s[1]; m[8+i] *= s[2]; }
  return m;
}
function readAcc(g, bin, ai){
  const a = g.accessors[ai], bv = g.bufferViews[a.bufferView], n = { SCALAR:1, VEC2:2, VEC3:3, VEC4:4 }[a.type];
  const C = { 5126:Float32Array, 5125:Uint32Array, 5123:Uint16Array, 5121:Uint8Array }[a.componentType];
  const off = (bv.byteOffset||0) + (a.byteOffset||0), stride = bv.byteStride || n*C.BYTES_PER_ELEMENT;
  const out = new Float64Array(a.count*n);
  const dv = new DataView(bin.buffer, bin.byteOffset);
  for(let i=0;i<a.count;i++) for(let k=0;k<n;k++){
    const p = off + i*stride + k*C.BYTES_PER_ELEMENT;
    out[i*n+k] = C===Float32Array ? dv.getFloat32(p,true) : C===Uint32Array ? dv.getUint32(p,true) : C===Uint16Array ? dv.getUint16(p,true) : dv.getUint8(p);
  }
  return out;
}
(async()=>{
  const want = process.argv.slice(2);
  fs.mkdirSync(CACHE, { recursive:true });
  const b = await chromium.launch({ executablePath:EXEC, args:['--no-sandbox'] });
  const p = await b.newPage();
  for(const S of SPECS){
    if(want.length && want.indexOf(S.name) < 0) continue;
    const meta = JSON.parse(execFileSync('curl', ['-s', 'https://api.polyhaven.com/files/' + S.id]).toString());
    const G = meta.gltf['1k'].gltf, dir = path.join(CACHE, 'm_' + S.id); fs.mkdirSync(dir, { recursive:true });
    const gpath = get(G.url, path.join(dir, 'm.gltf'));
    for(const [rel, f] of Object.entries(G.include)){ fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive:true }); get(f.url, path.join(dir, rel)); }
    const g = JSON.parse(fs.readFileSync(gpath, 'utf8'));
    const bin = fs.readFileSync(path.join(dir, g.buffers[0].uri));
    // 材質ごとに集める
    const groups = {};
    const walk = (ni, parent)=>{ const n = g.nodes[ni], m = mul(parent, trs(n));
      if(n.mesh !== undefined) g.meshes[n.mesh].primitives.forEach(pr=>{
        const mi = pr.material || 0, G2 = groups[mi] = groups[mi] || { pos:[], nor:[], uv:[], idx:[] };
        const P = readAcc(g, bin, pr.attributes.POSITION), N = readAcc(g, bin, pr.attributes.NORMAL),
              U = pr.attributes.TEXCOORD_0 !== undefined ? readAcc(g, bin, pr.attributes.TEXCOORD_0) : new Float64Array(P.length/3*2),
              I = pr.indices !== undefined ? readAcc(g, bin, pr.indices) : Float64Array.from({length:P.length/3}, (_,i)=>i);
        const base = G2.pos.length/3;
        for(let i=0;i<P.length/3;i++){
          const x=P[i*3], y=P[i*3+1], z=P[i*3+2];
          G2.pos.push(m[0]*x+m[4]*y+m[8]*z+m[12], m[1]*x+m[5]*y+m[9]*z+m[13], m[2]*x+m[6]*y+m[10]*z+m[14]);
          const a=N[i*3], bb=N[i*3+1], c=N[i*3+2];
          let nx=m[0]*a+m[4]*bb+m[8]*c, ny=m[1]*a+m[5]*bb+m[9]*c, nz=m[2]*a+m[6]*bb+m[10]*c; const l=Math.hypot(nx,ny,nz)||1;
          G2.nor.push(nx/l, ny/l, nz/l); G2.uv.push(U[i*2], U[i*2+1]);
        }
        for(const v of I) G2.idx.push(base + v);
      });
      (n.children||[]).forEach(c=>walk(c, m)); };
    const I4 = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    g.scenes[g.scene||0].nodes.forEach(n=>walk(n, I4));
    // 全体の箱で 16bit に詰める
    let mn=[1e9,1e9,1e9], mx=[-1e9,-1e9,-1e9], umn=[1e9,1e9], umx=[-1e9,-1e9];
    Object.values(groups).forEach(G2=>{ for(let i=0;i<G2.pos.length;i+=3) for(let k=0;k<3;k++){ mn[k]=Math.min(mn[k],G2.pos[i+k]); mx[k]=Math.max(mx[k],G2.pos[i+k]); }
      for(let i=0;i<G2.uv.length;i+=2) for(let k=0;k<2;k++){ umn[k]=Math.min(umn[k],G2.uv[i+k]); umx[k]=Math.max(umx[k],G2.uv[i+k]); } });
    const out = path.join(ROOT, S.name); fs.mkdirSync(out, { recursive:true });
    fs.readdirSync(out).forEach(f=>fs.unlinkSync(path.join(out, f)));
    const parts = [], mj = { box:[mn, mx], uv:[umn, umx], groups:[] };
    let off = 0;
    const q16 = (v, a, b)=>Math.max(-32767, Math.min(32767, Math.round(((v - a) / ((b - a) || 1)) * 65534 - 32767)));
    for(const [mi, G2] of Object.entries(groups)){
      const V = G2.pos.length/3, big = V > 65535;
      const pos = new Int16Array(V*3), nor = new Int8Array(V*3 + (V*3)%2), uv = new Int16Array(V*2), idx = big ? new Uint32Array(G2.idx) : new Uint16Array(G2.idx);
      for(let i=0;i<V*3;i++){ pos[i] = q16(G2.pos[i], mn[i%3], mx[i%3]); nor[i] = Math.round(G2.nor[i]*127); }
      for(let i=0;i<V*2;i++) uv[i] = q16(G2.uv[i], umn[i%2], umx[i%2]);
      const bufs = [pos, nor, uv, idx].map(a=>Buffer.from(a.buffer, a.byteOffset, a.byteLength));
      const g2 = { v:V, i:G2.idx.length, big, off:[] };
      bufs.forEach(bf=>{ g2.off.push(off); parts.push(bf); off += bf.length; const pad = (4 - off%4)%4; if(pad){ parts.push(Buffer.alloc(pad)); off += pad; } });
      // 色の絵
      const mat = g.materials[mi], ti = mat.pbrMetallicRoughness && mat.pbrMetallicRoughness.baseColorTexture;
      if(ti){
        const src = path.join(dir, g.images[g.textures[ti.index].source].uri);
        const b64 = fs.readFileSync(src).toString('base64');
        const patch = (S.patch && S.patch[mi]) || [];
        const jpg = await p.evaluate(async([b64, patch])=>{ const im = await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src='data:image/jpeg;base64,'+b64; });
          const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d'); x.drawImage(im, 0, 0, 512, 512);
          patch.forEach(P=>{ x.fillStyle = P.fill; x.fillRect(P.rect[0], P.rect[1], P.rect[2], P.rect[3]);
            if(P.band){ x.fillStyle = P.band[4]; x.fillRect(P.band[0], P.band[1], P.band[2], P.band[3]); }
            // 汚れを少し戻す（塗った所だけ新品に見えないように）
            for(let k=0;k<40;k++){ x.fillStyle = 'rgba(70,60,50,' + (Math.random()*0.08) + ')';
              x.fillRect(P.rect[0] + Math.random()*P.rect[2], P.rect[1] + Math.random()*P.rect[3], 4 + Math.random()*20, 2 + Math.random()*10); }
            P.lines.forEach(L=>{ x.font = 'bold ' + L[1] + 'px "Noto Sans CJK JP","Noto Sans JP",sans-serif'; x.fillStyle = L[2];
              x.fillText(L[0], P.rect[0] + L[3], P.rect[1] + L[4]); }); });
          const d = x.getImageData(0,0,512,512), a = d.data;
          for(let i=0;i<a.length;i+=4){ const l = 0.299*a[i]+0.587*a[i+1]+0.114*a[i+2];
            a[i] = (a[i]*0.7 + l*0.3)*0.9; a[i+1] = (a[i+1]*0.7 + l*0.3)*0.92; a[i+2] = (a[i+2]*0.7 + l*0.3)*0.88; }
          x.putImageData(d,0,0); return c.toDataURL('image/jpeg', 0.82).split(',')[1]; }, [b64, patch]);
        fs.writeFileSync(path.join(out, 'm' + mi + '.jpg'), Buffer.from(jpg, 'base64')); g2.tex = 'm' + mi;
      }
      const pb = mat.pbrMetallicRoughness || {};
      g2.metal = pb.metallicFactor === undefined ? 0 : Math.min(pb.metallicFactor, 0.6); g2.rough = pb.roughnessFactor === undefined ? 0.7 : pb.roughnessFactor;
      // 硝子（透過・半透明）は薄い透明の膜として描く。不透明で描くと文字盤が白い板で覆われた
      const tr = mat.extensions && mat.extensions.KHR_materials_transmission;
      if(mat.alphaMode === 'BLEND' || tr){ g2.glass = 1; g2.opacity = tr ? 0.12 : ((pb.baseColorFactor || [1,1,1,0.3])[3]); }
      if(pb.baseColorFactor && !ti) g2.color = pb.baseColorFactor.slice(0, 3);
      mj.groups.push(g2);
    }
    fs.writeFileSync(path.join(out, 'mesh.bin'), Buffer.concat(parts));
    fs.writeFileSync(path.join(out, 'meta.json'), JSON.stringify(mj));
    console.log(S.name, 'size', mx.map((v,k)=>(v-mn[k]).toFixed(2)).join('x'), 'groups', mj.groups.length, 'verts', mj.groups.reduce((s,x)=>s+x.v,0), 'bytes', off);
  }
  await b.close();
})();

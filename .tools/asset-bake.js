/* 外部素材の加工（設計指示書 第 7.2 節）。
   Poly Haven（CC0）の 1K の写真素材を取り寄せ、そのまま使わずに病院と 1987 年へ寄せて
   assets/textures/<名前>/{diff,nor,rough}.jpg に書き出す。加工の中身：
     diff  … 彩度を落とし、名前ごとの色へ寄せ、汚れの層（染み・垂れ・擦れ）を掛ける
     nor   … そのまま（JPEG で詰め直すだけ）
     rough … 汚れの層のところをわずかに粗くする
   原本はリポジトリに置かない（ここで毎回取り寄せる）。出所とライセンスは assets/LICENSES.md。
   使い方: node .tools/asset-bake.js [名前...]   （省略で全部） */
const { chromium, EXEC } = require('./pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..', 'assets', 'textures');
const CACHE = process.env.ASSET_CACHE || '/tmp/ward7-asset-cache';
const SPECS = [
  { name:'wall_tile',  id:'long_white_tiles',        tint:[0.84,0.90,0.84], desat:0.50, grime:'wall',  size:1024 },
  { name:'floor_lino', id:'old_linoleum_flooring_01', tint:[0.78,0.80,0.72], desat:0.55, grime:'floor', size:1024 },
  { name:'ceiling',    id:'ceiling_interior',         tint:[0.80,0.82,0.78], desat:0.60, grime:'ceil',  size:512  }
];
function fetchMap(id, map){
  const meta = JSON.parse(execFileSync('curl', ['-s', 'https://api.polyhaven.com/files/' + id], { maxBuffer: 1 << 26 }).toString());
  const f = meta[map]['1k'].jpg;
  fs.mkdirSync(CACHE, { recursive:true });
  const out = path.join(CACHE, id + '_' + map + '.jpg');
  if(!fs.existsSync(out)) execFileSync('curl', ['-s', '-o', out, f.url]);
  return out;
}
(async()=>{
  const want = process.argv.slice(2);
  const b = await chromium.launch({ executablePath:EXEC, args:['--no-sandbox'] });
  const p = await b.newPage();
  for(const S of SPECS){
    if(want.length && want.indexOf(S.name) < 0) continue;
    const src = { diff:fetchMap(S.id, 'Diffuse'), nor:fetchMap(S.id, 'nor_gl'), rough:fetchMap(S.id, 'Rough') };
    const dataOf = f => 'data:image/jpeg;base64,' + fs.readFileSync(f).toString('base64');
    const res = await p.evaluate(async (a)=>{
      const load = u => new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src=u; });
      const [di, ni, ri] = await Promise.all([load(a.diff), load(a.nor), load(a.rough)]);
      const N = a.size;
      function cv(){ const c=document.createElement('canvas'); c.width=c.height=N; return c; }
      // 汚れの層（0..1、1 が汚れ）。種は名前から。垂れは壁だけ、擦れは床だけ
      let s = 0; for(const ch of a.name) s = (s*31 + ch.charCodeAt(0)) >>> 0;
      const rnd = ()=>{ s = (s*1664525 + 1013904223) >>> 0; return s / 4294967296; };
      const gc = cv(), g = gc.getContext('2d');
      g.fillStyle = '#000'; g.fillRect(0,0,N,N);
      g.globalCompositeOperation = 'lighter';
      for(let i=0;i<46;i++){                       // 染み
        const x=rnd()*N, y=rnd()*N, r=N*(0.03+rnd()*0.12);
        const gr=g.createRadialGradient(x,y,0,x,y,r); gr.addColorStop(0,'rgba(255,255,255,'+(0.05+rnd()*0.12)+')'); gr.addColorStop(1,'rgba(255,255,255,0)');
        g.fillStyle=gr; g.fillRect(x-r,y-r,r*2,r*2);
      }
      if(a.grime === 'wall'){                      // 垂れ（上から下へ細く）
        for(let i=0;i<34;i++){ const x=rnd()*N, y0=rnd()*N*0.6, len=N*(0.1+rnd()*0.45), w=1+rnd()*3;
          const gr=g.createLinearGradient(0,y0,0,y0+len); gr.addColorStop(0,'rgba(255,255,255,0.20)'); gr.addColorStop(1,'rgba(255,255,255,0)');
          g.fillStyle=gr; g.fillRect(x,y0,w,len); }
      }
      if(a.grime === 'floor'){                     // 擦れ（台車の轍、靴の跡）
        g.lineCap='round';
        for(let i=0;i<22;i++){ const x=rnd()*N, y=rnd()*N, l=N*(0.1+rnd()*0.4), ang=rnd()*Math.PI;
          g.strokeStyle='rgba(255,255,255,'+(0.04+rnd()*0.06)+')'; g.lineWidth=2+rnd()*8;
          g.beginPath(); g.moveTo(x,y); g.lineTo(x+Math.cos(ang)*l, y+Math.sin(ang)*l); g.stroke(); }
      }
      g.globalCompositeOperation = 'source-over';
      const grime = g.getImageData(0,0,N,N).data;
      // diff：彩度を落とす → 色を寄せる → 汚れを掛ける（黄土色に沈める）
      const dc = cv(), d = dc.getContext('2d'); d.drawImage(di, 0, 0, N, N);
      const im = d.getImageData(0,0,N,N), px = im.data;
      for(let i=0;i<px.length;i+=4){
        let r=px[i]/255, gg=px[i+1]/255, bb=px[i+2]/255;
        const l = 0.2126*r + 0.7152*gg + 0.0722*bb;
        r = l + (r-l)*(1-a.desat); gg = l + (gg-l)*(1-a.desat); bb = l + (bb-l)*(1-a.desat);
        r*=a.tint[0]; gg*=a.tint[1]; bb*=a.tint[2];
        const k = Math.min(1, grime[i]/255 * 1.6);
        r *= 1 - k*0.35; gg *= 1 - k*0.42; bb *= 1 - k*0.55;
        px[i]=Math.max(0,Math.min(255,r*255)); px[i+1]=Math.max(0,Math.min(255,gg*255)); px[i+2]=Math.max(0,Math.min(255,bb*255));
      }
      d.putImageData(im,0,0);
      // rough：汚れのところを少し粗く
      const rc = cv(), rr = rc.getContext('2d'); rr.drawImage(ri, 0, 0, N, N);
      const rim = rr.getImageData(0,0,N,N), rp = rim.data;
      for(let i=0;i<rp.length;i+=4){ const k=Math.min(1, grime[i]/255*1.6); const v=Math.min(255, rp[i] + k*40); rp[i]=rp[i+1]=rp[i+2]=v; }
      rr.putImageData(rim,0,0);
      const nc = cv(); nc.getContext('2d').drawImage(ni, 0, 0, N, N);
      return { diff:dc.toDataURL('image/jpeg', 0.8), nor:nc.toDataURL('image/jpeg', 0.88), rough:rc.toDataURL('image/jpeg', 0.8) };
    }, { diff:dataOf(src.diff), nor:dataOf(src.nor), rough:dataOf(src.rough), size:S.size, tint:S.tint, desat:S.desat, grime:S.grime, name:S.name });
    const dir = path.join(ROOT, S.name); fs.mkdirSync(dir, { recursive:true });
    for(const k of ['diff','nor','rough']){
      fs.writeFileSync(path.join(dir, k + '.jpg'), Buffer.from(res[k].split(',')[1], 'base64'));
    }
    console.log(S.name, ['diff','nor','rough'].map(k=>k+' '+Math.round(fs.statSync(path.join(dir,k+'.jpg')).size/1024)+'KB').join(' · '));
  }
  await b.close();
})();

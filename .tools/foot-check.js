/* 追跡者の足の接地（設計指示書 第 9.2 節）。歩いているあいだ、床に留めた足が滑らないこと。
   留めている足の足先の水平の速さを見る（IK 前は歩きで 2.7m/s 滑っていた）。中央値 0.15m/s 未満、
   歩いている間に 7 割以上どちらかの足が留まっていること。平均は見ない：追跡者の「コマ落ち」（体ごと
   向きが跳ぶ演出）の瞬間だけ大きく跳ぶので、そこで決まってしまう
   使い方: node foot-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:360,height:640}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('file://'+process.argv[2]+'?debug=1',{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7', null, {timeout:60000});
  const r=await p.evaluate(async ()=>{
    const A=window.__WARD7; A.skipUI(true); A.seed(4242); A.settings.quality=1; A.start(); A.cheats.invisible=true;
    const T=window.THREE, h=A.hunter, v=new T.Vector3();
    let prev=null, slip=0, n=0, planted=0, frames=0; const sl=[];
    return await new Promise(res=>{
      const t0=performance.now();
      (function tick(){
        const P=h.parts, L=P.legL.plant ? P.legL : (P.legR.plant ? P.legR : null);
        if(h.walkK > 0.9){ frames++; if(L) planted++; }
        if(L){ L.tip.getWorldPosition(v);
          const cur={L:L.plant, x:v.x, z:v.z, t:performance.now()};
          if(prev && prev.L===L.plant){ const dt=(cur.t-prev.t)/1000; if(dt>0){ const sv=Math.hypot(cur.x-prev.x,cur.z-prev.z)/dt; slip+=sv; sl.push(sv); n++; } }
          prev=cur; } else prev=null;
        if(n>200 || performance.now()-t0>40000) res({mean:n?slip/n:99, med:n?sl.sort((a,b)=>a-b)[n>>1]:99, n, planted:frames?planted/frames:0});
        else requestAnimationFrame(tick);
      })();
    });
  });
  await b.close();
  const ok = r.n > 50 && r.med < 0.15 && r.planted > 0.7 && !errs.length;
  console.log(JSON.stringify(r), errs.slice(0,2));
  console.log(ok ? 'OK' : 'FAIL'); process.exit(ok?0:1);
})();

/* 見た目の品質基準（設計指示書 第 1.3 節）を画で測る。
   - 暗部の潰れ（輝度 2 以下）と白飛び（253 以上）が合わせて画面の 2% 以下
   - 平らな単色面（16×16 の区画で明暗の揺れがほぼ無く、暗闇ではない所）が 5% 以下
   各章で、出発点と見通しの利く 2 か所を向いて撮る（高精細・ランプ点灯・HUD は外す）。
   使い方: node look-check.js <html> [品質=2] [撮った画を置く接頭辞] */
const { chromium, EXEC } = require('./pw.js');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const q=+(process.argv[3]||2), pre=process.argv[4]||'';
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript((q)=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:q, diff:1, lang:'ja'})); }catch(e){} }, q);
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const rows=[]; let worst={crush:0, flat:0};
  for(let ch=0; ch<7; ch++){
    for(let v=0; v<3; v++){
      await p.evaluate(([ch,v])=>{ const A=window.__WARD7;
        if(v===0){ A.toTitle(); A.run.ch=ch; A.seed(null); A.skipUI(true); A.start(); }
        A.cheats.invisible=true; A.cheats.freeze=true;
        const pl=A.player; pl.lamp=true; pl.pitch=-0.04;
        if(v>0){ const s=A.findLOSSpot(pl.x, pl.z, 8*v, 40); if(s) pl.yaw=Math.atan2(-(s.x-pl.x), -(s.z-pl.z)); }
        else pl.yaw=(ch*1.3)%6.28;
        pl.viewYaw=pl.yaw;
        document.querySelectorAll('#hud, #touch, #note, #toast, #hint, #cue').forEach(e=>{ e.style.visibility='hidden'; });
      }, [ch,v]);
      // 始まりの暗転が明けて露出が落ち着くまで、ゲーム内の時間で待つ（CI の遅い描画で、決め打ちの
      // 1.8 秒では第1章の 1 枚目がまだ暗転の途中＝真っ黒な平らな画になっていた）
      const tt = await p.evaluate(()=>window.__WARD7.player.time);
      await p.waitForFunction((tt)=>window.__WARD7.player.time > tt + 1.6, tt, {timeout:60000}).catch(()=>{});
      const png = await p.locator('canvas').first().screenshot();
      if(pre) require('fs').writeFileSync(`${pre}-c${ch+1}-${v}.png`, png);
      const m = await p.evaluate(async(b64)=>{
        const img=await new Promise(r=>{ const i=new Image(); i.onload=()=>r(i); i.src='data:image/png;base64,'+b64; });
        const c=document.createElement('canvas'); c.width=img.width; c.height=img.height;
        const x=c.getContext('2d'); x.drawImage(img,0,0); const d=x.getImageData(0,0,c.width,c.height).data;
        const W=c.width, H=c.height, L=new Float32Array(W*H);
        let crush=0, clip=0;
        for(let i=0,j=0;i<d.length;i+=4,j++){ const l=0.2126*d[i]+0.7152*d[i+1]+0.0722*d[i+2]; L[j]=l; if(l<=2) crush++; else if(l>=253) clip++; }
        let flat=0, blocks=0;
        for(let by=0; by+16<=H; by+=16) for(let bx=0; bx+16<=W; bx+=16){
          let s=0, s2=0; for(let y=0;y<16;y++) for(let xx=0;xx<16;xx++){ const l=L[(by+y)*W+bx+xx]; s+=l; s2+=l*l; }
          const mu=s/256, sd=Math.sqrt(Math.max(0, s2/256-mu*mu)); blocks++;
          if(mu > 14 && sd < 0.8) flat++;
        }
        return { crush:(crush+clip)/(W*H)*100, flat:flat/blocks*100 };
      }, png.toString('base64'));
      rows.push({ch:ch+1, v, crush:+m.crush.toFixed(2), flat:+m.flat.toFixed(2)});
      worst.crush=Math.max(worst.crush,m.crush); worst.flat=Math.max(worst.flat,m.flat);
    }
  }
  rows.forEach(r=>console.log(`第${r.ch}章 #${r.v}  潰れ・白飛び ${r.crush.toFixed(2)}%  平らな面 ${r.flat.toFixed(2)}%`));
  console.log(`最悪  潰れ・白飛び ${worst.crush.toFixed(2)}%（基準 2）  平らな面 ${worst.flat.toFixed(2)}%（基準 5）  errs ${errs.length}`);
  const ok = worst.crush <= 2 && worst.flat <= 5 && !errs.length;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

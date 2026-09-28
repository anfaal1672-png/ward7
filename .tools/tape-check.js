/* 録音テープ（設計指示書 第 11.5 節）。章の最初のカルテで、まだ聴いていないテープが流れ、
   字幕が焼いたときの区切りに合わせて行ごとに送られること。聴いた章では普通のカルテに戻ること。
   英語では字幕が英語になること。声の素材が無いときは書き起こしを読ませること。
   使い方: node tape-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
async function run(b, file, lang, noVoice){
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.addInitScript((lang)=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:lang}));
    localStorage.removeItem('ward7.journal'); }catch(e){} }, lang);
  await p.goto('file://'+file,{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7 && !!window.W7_ASSETS', null, {timeout:60000});
  if(noVoice) await p.evaluate(()=>{ delete window.W7_ASSETS['voice/tapes']; });
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; A.audio.init(); A.audio.resume(); });
  await p.waitForTimeout(500);
  await p.evaluate(()=>window.__WARD7.showNote(0));
  const t0 = await p.evaluate(()=>window.__WARD7.tape());
  await p.waitForTimeout(noVoice ? 300 : 7000);
  const t1 = await p.evaluate(()=>window.__WARD7.tape());
  const heard = await p.evaluate(()=>!!window.__WARD7.journal().tapes[0]);
  await p.evaluate(()=>window.__WARD7.showNote(0));
  const t2 = await p.evaluate(()=>window.__WARD7.tape());
  await p.close();
  return { t0, t1, heard, t2, errs };
}
(async()=>{
  const file=process.argv[2];
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox','--autoplay-policy=no-user-gesture-required']});
  const ja = await run(b, file, 'ja', false), en = await run(b, file, 'en', false), nv = await run(b, file, 'ja', true);
  await b.close();
  const R = [
    ['日本語：テープの見出し', /^録音テープ 1 — 昭和六十二年四月二日$/.test(ja.t0.head)],
    ['日本語：声が流れて字幕が 2 行目以降へ進む', ja.t1.playing && ja.t1.line >= 1 && /^院長：/.test(ja.t1.body)],
    ['日本語：聴いた記録が手帳に残る', ja.heard],
    ['日本語：聴いた章では普通のカルテ', !/^録音/.test(ja.t2.head) && ja.t2.i < 0],
    ['英語：見出しと字幕が英語', /^Tape 1 — April 2, 1987$/.test(en.t1.head) && /^Director: /.test(en.t1.body) && !/[぀-ヿ一-鿿]/.test(en.t1.body)],
    ['声が無いとき：書き起こしを読ませる', nv.t1.i < 0 && /^院長：記録。/.test(nv.t1.body) && nv.t1.body.split('\n').length === 4],
    ['ページのエラーが無い', !ja.errs.length && !en.errs.length && !nv.errs.length]
  ];
  let bad = 0;
  R.forEach(r=>{ if(!r[1]) bad++; console.log((r[1]?'  ok   ':'  FAIL ') + r[0]); });
  if(bad) console.log(JSON.stringify({ja, en, nv}).slice(0, 1500));
  console.log(bad ? 'FAIL' : 'OK'); process.exit(bad?1:0);
})();

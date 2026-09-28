/* 手帳と結末（設計指示書 第 11.3・20.1 節）を実ブラウザで確かめる。
   結末は夜勤か最後の章でだけ起きるので、夜勤で走らせる。
   1) 私信を全部読んだ手帳を仕込み、妹の 3 通を指で選んで結びつく
   2) 灯りを消したまま非常口を抜けると「退院」、点けたままなら「脱出」
   使い方: node story-check.js <html> [手帳の png] */
const { chromium, EXEC, useUntil } = require('./pw.js');
const fs=require('fs'), path=require('path');
async function run(b, html, lampOn, linked, shot){
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript((lk)=>{ try{
    localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'ja'}));
    localStorage.setItem('ward7.journal', JSON.stringify({notes:{0:1,3:1,9:1,17:1},
      letters:{0:1,1:1,2:1,3:1,4:1,5:1,6:1}, linked:lk, endings:{}}));
  }catch(e){} }, linked);
  await p.goto('file://'+html,{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  let linkRes = null;
  if(!linked){
    await p.click('#btnJournal');
    const letters = p.locator('#jList .jdoc.letter');
    // 妹の声は 三・五・七（0 始まりで 2,4,6）。まず外れを 3 通選んで結びつかないこと
    for(const i of [0,1,3]) await letters.nth(i).click();
    const wrong = await p.evaluate(()=>document.querySelectorAll('#jList .jdoc.linked').length);
    for(const i of [2,4,6]) await p.locator('#jList .jdoc.letter').nth(i).click();
    const right = await p.evaluate(()=>document.querySelectorAll('#jList .jdoc.linked').length);
    const saved = await p.evaluate(()=>JSON.parse(localStorage.getItem('ward7.journal')).linked);
    if(shot) await p.screenshot({path:shot, fullPage:false});
    linkRes = {wrong, right, saved};
    await p.click('#btnJournalBack');
  }
  await p.evaluate((lampOn)=>{ const A=window.__WARD7; A.run.ch = -1; A.seed(77); A.start();
    const pl=A.player, w=A.world; pl.got=pl.need; pl.hasKey=true; w.endgame=true; if(w.exit) w.exit.open=true;
    if(w.exit){ pl.x=w.exit.x; pl.z=w.exit.z; }
    pl.lamp=lampOn; }, lampOn);
  await p.waitForTimeout(300);
  await useUntil(p, ()=>!document.getElementById('win').hidden);
  await p.waitForFunction(()=>!document.getElementById('win').hidden,{timeout:15000}).catch(()=>{});
  const r = await p.evaluate(()=>({title:document.getElementById('winTitle').textContent,
    story:document.getElementById('winStory').textContent.slice(0,24),
    endings:JSON.parse(localStorage.getItem('ward7.journal')).endings}));
  await p.close();
  return Object.assign({lampOn, linked, link:linkRes, errs:errs.length}, r);
}
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const html=process.argv[2];
  const a = await run(b, html, false, false, process.argv[3]);   // 結びつけてから灯りを消して出る
  const c = await run(b, html, true,  true,  null);               // 結びついていても灯りを点けたままなら通常
  console.log(JSON.stringify(a)); console.log(JSON.stringify(c));
  const ok = a.link && a.link.wrong===0 && a.link.right===3 && a.link.saved===true &&
             a.title==='退院' && a.endings.B===1 && c.title==='脱出' && c.endings.A===1 && !a.errs && !c.errs;
  console.log(ok ? 'OK' : 'FAIL');
  await b.close(); process.exit(ok?0:1);
})();

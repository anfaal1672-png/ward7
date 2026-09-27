/* 英語（設計指示書 第 14 章）。英語を選んだ状態で主な画面を開き、
   見えている文字に日本語が残っていないかを数える。
   使い方: node lang-check.js <html> [タイトルの png] [ゲーム中の png] */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path');
(async()=>{
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2, locale:'en-US'});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js', r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  await p.addInitScript(()=>{ try{ localStorage.setItem('ward7.settings', JSON.stringify({quality:0, diff:1, lang:'en'}));
    localStorage.setItem('ward7.journal', JSON.stringify({notes:{0:1,6:1,12:1}, letters:{0:1,1:1}, linked:false, endings:{}})); }catch(e){} });
  await p.goto('file://'+process.argv[2],{waitUntil:'load'});
  await p.waitForFunction('!!window.__WARD7',{timeout:20000});
  const leftovers = async (tag)=> p.evaluate((tag)=>{
    const JP=/[぀-ヿ一-鿿]/, out=[];
    const w=document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while(w.nextNode()){ const n=w.currentNode, el=n.parentElement;
      if(!el || !JP.test(n.data)) continue;
      const st=getComputedStyle(el); if(el.closest('[hidden]') || st.display==='none' || st.visibility==='hidden') continue;
      if(/日本語|言語/.test(n.data)) continue;              // 言語の切り替えだけは母語で出す
      out.push(n.data.trim().slice(0,40)); }
    return {tag, n:out.length, sample:out.slice(0,8)}; }, tag);
  const res=[];
  await p.waitForTimeout(800); res.push(await leftovers('title'));
  if(process.argv[3]) await p.screenshot({path:process.argv[3], fullPage:true});
  await p.click('#btnOpt'); await p.waitForTimeout(300); res.push(await leftovers('settings')); await p.click('#btnOptBack');
  await p.click('#btnJournal'); await p.waitForTimeout(300); res.push(await leftovers('journal')); await p.click('#btnJournalBack');
  await p.evaluate(()=>{ const A=window.__WARD7; A.seed(4242); A.start(); A.cheats.invisible=true; });
  await p.waitForTimeout(1500);
  // カルテを 1 枚拾う
  await p.evaluate(()=>{ const A=window.__WARD7, r=A.world.records[0]; A.player.x=r.x+0.3; A.player.z=r.z; A.use(); });
  await p.waitForTimeout(700);
  res.push(await leftovers('play+note'));
  if(process.argv[4]) await p.screenshot({path:process.argv[4]});
  await p.evaluate(()=>{ window.__WARD7.act && 0; });
  await p.keyboard.press('Escape'); await p.waitForTimeout(300); res.push(await leftovers('pause'));
  await p.keyboard.press('Escape');
  await p.evaluate(()=>{ const A=window.__WARD7; for(const k in A.cheats) if(typeof A.cheats[k]==='boolean') A.cheats[k]=false;
    A.run.ch=-1; A.start(); const pl=A.player, w=A.world; pl.got=pl.need; pl.hasKey=true; w.endgame=true; w.exit.open=true; pl.x=w.exit.x; pl.z=w.exit.z; });
  await p.waitForTimeout(300); await p.evaluate(()=>window.__WARD7.use());
  await p.waitForFunction(()=>!document.getElementById('win').hidden,{timeout:15000}).catch(()=>{});
  res.push(await leftovers('win'));
  res.forEach(r=>console.log(r.tag.padEnd(10), '残り', r.n, r.sample.join(' | ')));
  console.log('lang', await p.evaluate(()=>document.documentElement.lang), 'errs', errs.length, errs.slice(0,2));
  await b.close();
})();

/* 保存の写し（第 1 章 Store）が効くかを実ブラウザで確かめる。
   設定を書く → localStorage を消す（Safari の 7 日消去の再現）→ 読み直す →
   設定が戻っているか。http で開く（file:// は IndexedDB の扱いがブラウザで違う）。
   使い方: node store-check.js <html の絶対パス> */
const { chromium, EXEC } = require('./pw.js');
const fs=require('fs'), path=require('path'), http=require('http');
(async()=>{
  const file=process.argv[2]||'/home/user/ward7/ward7.html';
  const srv=http.createServer((q,r)=>{
    if(q.url.includes('three.min.js')){ r.writeHead(200,{'content-type':'application/javascript'});
      return r.end(fs.readFileSync(path.join(__dirname,'..','three.min.js'))); }
    // ほかの物（assets.js・sw.js）は置いてあるとおりに返す。全部に HTML を返していて、
    // スクリプトとして読まれて「Unexpected token '<'」が 3 件出ていた
    const f = path.join(path.dirname(file), q.url.split('?')[0]);
    if(!/ward7\.html$/.test(q.url.split('?')[0]) && fs.existsSync(f) && fs.statSync(f).isFile()){
      r.writeHead(200,{'content-type': /\.js$/.test(f) ? 'application/javascript' : 'application/octet-stream'}); return r.end(fs.readFileSync(f)); }
    r.writeHead(200,{'content-type':'text/html'}); r.end(fs.readFileSync(file));
  }).listen(0);
  const url='http://127.0.0.1:'+srv.address().port+'/ward7.html';
  const b=await chromium.launch({executablePath:EXEC,
    args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
  const p=await b.newPage({viewport:{width:390,height:844}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.route('**/three.min.js',r=>r.fulfill({status:200,contentType:'application/javascript',
    body:fs.readFileSync(path.join(__dirname,'..','three.min.js'),'utf8')}));
  const ready=()=>p.waitForFunction('!!window.__WARD7',{timeout:30000});
  await p.goto(url); await ready();
  // 設定を変えて保存させる（sens は既定 1.0）
  await p.evaluate(()=>{ const s=document.getElementById('sens'); s.value='2.2';
    s.dispatchEvent(new Event('input',{bubbles:true})); s.dispatchEvent(new Event('change',{bubbles:true})); });
  await p.waitForTimeout(800);
  const before=await p.evaluate(()=>localStorage.getItem('ward7.settings'));
  await p.evaluate(()=>localStorage.clear());
  await p.reload(); await ready();
  await p.waitForTimeout(2500);                    // 戻す → 読み直し を待つ
  await ready();
  const after=await p.evaluate(()=>({ls:localStorage.getItem('ward7.settings'), sens:window.__WARD7.settings.sens}));
  console.log('保存時', before);
  console.log('戻した後', JSON.stringify(after));
  const ok = before && after.ls === before && Math.abs(after.sens-2.2) < 1e-6 && errs.length === 0;
  console.log(ok ? 'OK 写しから戻った' : 'FAIL 戻らなかった', 'エラー', errs.length, errs.slice(0,3));
  await b.close(); srv.close(); process.exit(ok?0:1);
})();

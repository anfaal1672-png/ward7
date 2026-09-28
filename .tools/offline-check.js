/* Web 版のオフライン（設計指示書 第 15.5 節）。localhost で一度開いて Service Worker に
   しまわせ、サーバを止めてから読み直しても起動することを見る。
   使い方: node offline-check.js */
const { chromium, EXEC } = require('./pw.js');
const http=require('http'), fs=require('fs'), path=require('path');
const ROOT = path.join(__dirname, '..');
const TYPES = { '.html':'text/html', '.js':'application/javascript' };
(async()=>{
  const srv = http.createServer((q,r)=>{
    let f = decodeURIComponent(q.url.split('?')[0]); if(f === '/') f = '/ward7.html';
    const fp = path.join(ROOT, f);
    if(!fs.existsSync(fp)){ r.writeHead(404); return r.end(); }
    r.writeHead(200, {'content-type': TYPES[path.extname(fp)] || 'application/octet-stream'}); r.end(fs.readFileSync(fp));
  }).listen(0);
  const port = srv.address().port, url = 'http://localhost:' + port + '/ward7.html';
  const b = await chromium.launch({ executablePath:EXEC, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
  const ctx = await b.newContext(); const p = await ctx.newPage();
  await p.goto(url); await p.waitForFunction('!!window.__WARD7', null, {timeout:30000});
  await p.waitForFunction(()=>navigator.serviceWorker && navigator.serviceWorker.controller, null, {timeout:30000}).catch(()=>{});
  await p.reload(); await p.waitForFunction('!!window.__WARD7', null, {timeout:30000});
  const ctrl = await p.evaluate(()=>!!(navigator.serviceWorker && navigator.serviceWorker.controller));
  srv.close();
  await ctx.setOffline(true);
  let offlineOk = false;
  try{ await p.reload(); await p.waitForFunction('!!window.__WARD7', null, {timeout:30000});
       offlineOk = await p.evaluate(()=>!!window.THREE && !!window.W7_ASSETS); }catch(e){}
  console.log(JSON.stringify({ controlled:ctrl, offlineBoot:offlineOk }));
  console.log(ctrl && offlineOk ? 'OK' : 'FAIL');
  await b.close(); process.exit(ctrl && offlineOk ? 0 : 1);
})();

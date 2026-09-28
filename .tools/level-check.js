/* レベル制作の道具（設計指示書 第 6.4 節）の検め。
   1. Blender の書き出し（blender/ch1.glb）を取り込むと、組み込まれた game/src/levels/ch1.json と一致する
   2. 第1章で上書きが読まれ、光源が点き、演出トリガーの中へ入ると鳴る（1 回だけ）
   3. ゲームの中の編集（?debug=1&edit=1）：印が出る・置ける・動かせる・保存でき、次に入ったとき読み直される
   4. カーソルで印を掴んで床の上を引きずると、その印が動く（マウスの経路）
   使い方: node level-check.js <html> */
const { chromium, EXEC } = require('./pw.js');
const fs = require('fs'), path = require('path');
const { importGlb } = require('./level-import.js');
async function open(b, file, q){
  const p = await b.newPage({ viewport:{ width:900, height:600 } });
  const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('file://' + file + q, { waitUntil:'load' });
  await p.waitForFunction('!!window.__WARD7', null, { timeout:60000 });
  await p.evaluate(() => { const A = window.__WARD7; A.skipUI(true); A.settings.quality = 0; A.run.ch = 0; A.start(); A.cheats.invisible = true; });
  return { p, errs };
}
(async()=>{
  const file = process.argv[2], R = [];
  const shipped = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'game', 'src', 'levels', 'ch1.json'), 'utf8'));
  const fromGlb = importGlb(path.join(__dirname, 'blender', 'ch1.glb'));
  R.push(['Blender の書き出しを取り込むと組み込みの ch1.json と一致', JSON.stringify(fromGlb) === JSON.stringify(shipped)]);
  const b = await chromium.launch({ executablePath:EXEC, args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });

  // 2. 遊ぶとき
  let { p, errs } = await open(b, file, '?debug=1');
  const s0 = await p.evaluate(() => { const L = window.__WARD7.level; return { n:L.cur() ? L.cur().items.length : 0, lights:L.lights(), mk:L.markers() }; });
  R.push(['第1章で上書きが読まれ光源が点く（編集でなければ印は出ない）', s0.n === shipped.items.length && s0.lights === shipped.items.filter(i => i.kind === 'light').length && s0.mk === 0]);
  const ti = shipped.items.findIndex(i => i.kind === 'trigger');
  await p.evaluate((it) => { const pl = window.__WARD7.player; pl.x = it.x; pl.z = it.z; }, shipped.items[ti]);
  await p.waitForFunction((ti) => !!window.__WARD7.level.fired()[ti], ti, { timeout:15000 }).catch(() => {});
  const f1 = await p.evaluate((ti) => window.__WARD7.level.fired()[ti], ti);
  R.push(['演出トリガーの中へ入ると鳴る', f1 === 1]);
  await p.close();

  // 3. ゲームの中の編集
  ({ p, errs } = await open(b, file, '?debug=1&edit=1'));
  await p.evaluate(() => { try{ localStorage.removeItem('ward7.level.ch1'); }catch(e){} });
  const e0 = await p.evaluate(() => window.__WARD7.level.markers());
  const e1 = await p.evaluate(() => { const A = window.__WARD7, L = A.level, i = L.add('patrol', A.player.x + 1, A.player.z);
    L.move(i, A.player.x + 2.5, A.player.z - 1); const it = L.cur().items[i]; const js = JSON.parse(L.save());
    return { i, x:it.x, z:it.z, px:A.player.x, pz:A.player.z, saved:js.items.length, mk:L.markers() }; });
  R.push(['編集：印が出る', e0 === shipped.items.length]);
  R.push(['編集：置いて動かして保存できる', e1.saved === shipped.items.length + 1 && Math.abs(e1.x - (e1.px + 2.5)) < 0.02 && Math.abs(e1.z - (e1.pz - 1)) < 0.02 && e1.mk === e1.saved]);
  // 保存した物が次に入ったとき読み直される
  await p.evaluate(() => { const A = window.__WARD7; A.start(); });
  const e2 = await p.evaluate(() => window.__WARD7.level.cur().items.length);
  R.push(['編集：保存した物を次に読み直す', e2 === shipped.items.length + 1]);

  // 4. マウスで掴んで引きずる：足元の前 3m に印を置き、画面上の位置を投影してから掴む
  const drag = await p.evaluate(() => {
    const A = window.__WARD7, pl = A.player, T = window.THREE, cam = A.camera, L = A.level;
    const fx = -Math.sin(pl.yaw), fz = -Math.cos(pl.yaw);
    const i = L.add('trigger', pl.x + fx*3, pl.z + fz*3); L.cursor(true);
    cam.updateMatrixWorld(true);
    const it = L.cur().items[i], v = new T.Vector3(it.x, 0, it.z).project(cam), r = document.querySelector('canvas').getBoundingClientRect();
    const w = new T.Vector3(it.x + fz*1.0, 0, it.z - fx*1.0).project(cam);
    return { i, x0:it.x, z0:it.z, sx:r.left + (v.x*0.5+0.5)*r.width, sy:r.top + (-v.y*0.5+0.5)*r.height,
             tx:r.left + (w.x*0.5+0.5)*r.width, ty:r.top + (-w.y*0.5+0.5)*r.height };
  });
  await p.evaluate(() => { window.__WARD7.cheats.freeze = true; });
  await p.mouse.move(drag.sx, drag.sy); await p.mouse.down();
  await p.mouse.move(drag.tx, drag.ty, { steps:6 }); await p.mouse.up();
  const d1 = await p.evaluate((i) => { const it = window.__WARD7.level.cur().items[i]; return { x:it.x, z:it.z, sel:window.__WARD7.level.sel() }; }, drag.i);
  const moved = Math.hypot(d1.x - drag.x0, d1.z - drag.z0);
  R.push(['編集：カーソルで印を掴んで動かせる（' + moved.toFixed(2) + 'm）', d1.sel === drag.i && moved > 0.5]);
  R.push(['ページのエラーが無い', !errs.length]);
  await b.close();
  let bad = 0;
  R.forEach(r => { if(!r[1]) bad++; console.log((r[1] ? '  ok   ' : '  FAIL ') + r[0]); });
  if(bad) console.log(JSON.stringify({ s0, f1, e0, e1, e2, drag, d1, errs }).slice(0, 1200));
  console.log(bad ? 'FAIL' : 'OK'); process.exit(bad ? 1 : 0);
})();

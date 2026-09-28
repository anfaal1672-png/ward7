/* Playwright と Chromium の在り処。このコンテナでは /opt に入っているものを使い、
   CI（GitHub Actions）では npm で入れた playwright と、それが落とした Chromium を使う。
   PW_CHROME を指定すればそれを優先する。 */
const fs = require('fs');
let pw;
try{ pw = require('/opt/node22/lib/node_modules/playwright'); }catch(e){ pw = require('playwright'); }
const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXEC = process.env.PW_CHROME || (fs.existsSync(LOCAL) ? LOCAL : undefined);
/* 使う（input.use）を、cond が真になるまで押し直す。入力は次のフレームで 1 回だけ
   消費されるので、その瞬間に別の物が近いと空振りする（CI で落ちた）。 */
async function useUntil(p, cond, tries){
  for(let i=0; i<(tries||15); i++){
    if(await p.evaluate(cond)) return true;
    await p.evaluate(()=>window.__WARD7.use());
    await p.waitForTimeout(400);
  }
  return await p.evaluate(cond);
}
module.exports = { chromium: pw.chromium, EXEC, useUntil };

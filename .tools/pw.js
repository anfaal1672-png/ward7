/* Playwright と Chromium の在り処。このコンテナでは /opt に入っているものを使い、
   CI（GitHub Actions）では npm で入れた playwright と、それが落とした Chromium を使う。
   PW_CHROME を指定すればそれを優先する。 */
const fs = require('fs');
let pw;
try{ pw = require('/opt/node22/lib/node_modules/playwright'); }catch(e){ pw = require('playwright'); }
const LOCAL = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const EXEC = process.env.PW_CHROME || (fs.existsSync(LOCAL) ? LOCAL : undefined);
module.exports = { chromium: pw.chromium, EXEC };

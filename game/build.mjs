/* 章ごとのファイルから ward7.html を組み立てる。
   あわせて three.js（package.json で版を固定）を three.min.js へ束ねる。
   以前は CDN の r128 を読んでいたが、それだと iOS アプリが回線なしで起動できない。
   ward7.html は iOS の包装・撮影ツール・自己診断がそのまま読むので、
   今は組み立て結果をリポジトリに置き、ビルド無しでも遊べる状態を保つ。
   使い方:
     node game/build.mjs           ward7.html を書き出す
     node game/build.mjs --check   書き出さずに、ward7.html が源と一致するかだけ見る（CI 用） */
import fs from 'node:fs';
import path from 'node:path';
import { buildSync } from 'esbuild';
import { createHash } from 'node:crypto';

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(here, 'src');
const target = path.join(here, '..', 'ward7.html');
const threeTarget = path.join(here, '..', 'three.min.js');
const assetsTarget = path.join(here, '..', 'assets.js');
const assetsDir = path.join(here, '..', 'assets');

/* 外部素材（第 7.2 節）。file:// で開くと画像は別オリジン扱いになり WebGL に渡せない
   （iOS の WKWebView も同じ）。data URI にして 1 本のスクリプトへ畳む。
   LICENSES.md に載っていない素材があれば組み立てを止める。 */
function buildAssets(){
  const lic = fs.readFileSync(path.join(assetsDir, 'LICENSES.md'), 'utf8');
  const texRoot = path.join(assetsDir, 'textures');
  const out = {};
  for(const name of fs.readdirSync(texRoot).sort()){
    if(lic.indexOf('textures/' + name + '/') < 0) throw new Error('assets/LICENSES.md に textures/' + name + '/ の記録が無い');
    for(const f of fs.readdirSync(path.join(texRoot, name)).sort()){
      if(!/\.jpg$/.test(f)) continue;
      out[name + '/' + f.replace(/\.jpg$/, '')] = 'data:image/jpeg;base64,' +
        fs.readFileSync(path.join(texRoot, name, f)).toString('base64');
    }
  }
  /* 収録素材の音（第 10.1 節）。WAV を data URI に。LICENSES.md の sfx/ 行が無ければ止める */
  const sfxRoot = path.join(assetsDir, 'sfx');
  if(fs.existsSync(sfxRoot)){
    if(lic.indexOf('| sfx/') < 0) throw new Error('assets/LICENSES.md に sfx/ の記録が無い');
    for(const f of fs.readdirSync(sfxRoot).sort()){
      if(!/\.wav$/.test(f)) continue;
      out['sfx/' + f.replace(/\.wav$/, '')] = 'data:audio/wav;base64,' + fs.readFileSync(path.join(sfxRoot, f)).toString('base64');
    }
  }
  return '/* 生成物（game/build.mjs）。assets/ の加工済み素材（画と音）。出所は assets/LICENSES.md */\n' +
         'window.W7_ASSETS=' + JSON.stringify(out) + ';\n';
}
const assetsJs = buildAssets();

const three = buildSync({
  entryPoints: [path.join(here, 'vendor', 'three-global.js')],
  bundle: true, minify: true, format: 'iife', write: false,
  target: ['safari15'], legalComments: 'inline'
}).outputFiles[0].text;

const order = JSON.parse(fs.readFileSync(path.join(src, 'js', 'order.json'), 'utf8'));
const strip = s => s.endsWith('\n') ? s.slice(0, -1) : s;
const js = order.map(f => strip(fs.readFileSync(path.join(src, 'js', f), 'utf8'))).join('\n');
const css = strip(fs.readFileSync(path.join(src, 'style.css'), 'utf8'));
const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');

// 置換文字列の $ を解釈させないよう関数で渡す
const html = shell
  .replace('<!--@style-->', () => css)
  .replace('<!--@script-->', () => "(function(){\n'use strict';\n" + js + '\n})();');

// Service Worker（第 15.5 節）。キャッシュの名前を中身から作る
const swTarget = path.join(here, '..', 'sw.js');
const swHash = createHash('sha256').update(html).update(three).update(assetsJs).digest('hex').slice(0, 12);
const swJs = fs.readFileSync(path.join(src, 'sw.js'), 'utf8').replace('__HASH__', swHash);

if(process.argv.includes('--check')){
  const cur = fs.readFileSync(target, 'utf8');
  if(cur !== html){
    console.error('ward7.html が game/src と一致しない。node game/build.mjs で組み直すこと');
    process.exit(1);
  }
  const curThree = fs.existsSync(threeTarget) ? fs.readFileSync(threeTarget, 'utf8') : '';
  if(curThree !== three){
    console.error('three.min.js が package.json の three と一致しない。node game/build.mjs で組み直すこと');
    process.exit(1);
  }
  const curAssets = fs.existsSync(assetsTarget) ? fs.readFileSync(assetsTarget, 'utf8') : '';
  if(curAssets !== assetsJs){
    console.error('assets.js が assets/textures と一致しない。node game/build.mjs で組み直すこと');
    process.exit(1);
  }
  if((fs.existsSync(swTarget) ? fs.readFileSync(swTarget, 'utf8') : '') !== swJs){
    console.error('sw.js が源と一致しない。node game/build.mjs で組み直すこと');
    process.exit(1);
  }
  console.log('ward7.html・three.min.js・assets.js・sw.js は源と一致');
}else{
  fs.writeFileSync(target, html);
  fs.writeFileSync(threeTarget, three);
  fs.writeFileSync(assetsTarget, assetsJs);
  fs.writeFileSync(swTarget, swJs);
  console.log('ward7.html を書き出した（' + html.split('\n').length + ' 行）');
}

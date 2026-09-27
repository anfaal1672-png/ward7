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

const here = path.dirname(new URL(import.meta.url).pathname);
const src = path.join(here, 'src');
const target = path.join(here, '..', 'ward7.html');
const threeTarget = path.join(here, '..', 'three.min.js');

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
  console.log('ward7.html・three.min.js は源と一致');
}else{
  fs.writeFileSync(target, html);
  fs.writeFileSync(threeTarget, three);
  console.log('ward7.html を書き出した（' + html.split('\n').length + ' 行）');
}

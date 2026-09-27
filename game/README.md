# game/ — ward7.html の源

`ward7.html` は **ここから組み立てる**。直すのは `game/src/` の方で、
`ward7.html` を直接いじらないこと（CI の `check` が食い違いを止める）。

    node game/build.mjs           # ward7.html を書き出す
    node game/build.mjs --check   # 一致しているかだけ見る
    npm run check                 # 一致＋構文
    npm run selftest              # 実ブラウザの自己診断（4 段階）

| | |
|---|---|
| `src/shell.html` | HTML の骨。`<!--@style-->` と `<!--@script-->` に中身が入る |
| `src/style.css` | `<style>` の中身 |
| `src/js/NN-chMM-*.js` | `<script>` の中身を章ごとに。NN は並び順、MM は章番号（20 起動 が最後に来るため一致しない） |
| `src/js/01b-i18n.js` | 英語。画面に入った文字を訳す（第 14 章）。章番号の付かない追加の章 |
| `src/js/order.json` | 連結の順番 |
| `split.mjs` | 一度だけ使った切り出し。記録のために残す |
| `vendor/three-global.js` | three.js を `window.THREE` として出す入口。`three.min.js` に束ねられる |

`npm ci` を先に 1 度（esbuild・jsdom・three が入る）。

組み立ては「並べて繋ぐ」だけで、全体を `(function(){ 'use strict'; ... })();`
で包む。章どうしは今も同じ関数スコープの変数を共有している。
モジュール化（import/export）と型付けは設計指示書 第 15.2 節の手順 2 以降。

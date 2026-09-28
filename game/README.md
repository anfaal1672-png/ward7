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
| `src/ts/NN-chMM-*.ts` | `<script>` の中身を章ごとに（TypeScript）。NN は並び順、MM は章番号（20 起動 が最後に来るため一致しない） |
| `src/ts/01b-i18n.ts` | 英語。画面に入った文字を訳す（第 14 章）。章番号の付かない追加の章 |
| `src/ts/17b-ch17-snapshot.ts` | 状態の保存と復元（デバッグ・`.tools/snap-check.js`） |
| `src/ts/order.json` | 連結の順番 |
| `vendor/three-global.js` | three.js を `window.THREE` として出す入口。`three.min.js` に束ねられる |

`npm ci` を先に 1 度（esbuild・jsdom・three・typescript が入る）。

組み立ては「並べて繋ぎ、型を剥がす」だけで（`typescript` の transpileModule。
注釈は残る）、全体を `(function(){ 'use strict'; ... })();` で包む。
各 `.ts` は import/export を持たない台本で、章どうしは同じ関数スコープの変数を
共有している。型の検めは `npm run typecheck`（`tsconfig.json`）、型の無い
引数・変数が章ごとに 0 のままかは `node .tools/any-ratchet.js` が見る。
トップレベルで起動を打ち切るときは `return` の代わりに `throw W7_ABORT;`
（第 0 章が黙って捨てる）。

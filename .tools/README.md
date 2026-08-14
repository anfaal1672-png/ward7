# 検証ツール（AI観戦モードのクリア率測定）

コンテナが巻き戻ってもここから復旧できるよう、リポジトリに置いてある。
harness.js（jsdom + three.js のスタブ）だけはスクラッチパッド側にある。

## 使い方

    cp .tools/*.js .tools/*.sh <scratchpad>/
    cd <scratchpad>
    node extract.js /home/user/ward7/ward7.html ward7.js && node --check ward7.js
    ./runall.sh /home/user/ward7/ward7.html 0 9200 120 4 > out.txt 2>/dev/null
    node sum2.js out.txt

## 測定上の注意（実測で確かめた落とし穴）

- **1 試行 1 プロセス**で走らせること。1 プロセスで連続実行すると前の試行の
  状態が漏れ、同じ種でも結果が変わる（連続 6/8 に対し独立 4/8）。
- **判定は 3 ブロック以上（360 本）で行う**。シード列ごとにクリア率が
  ±8 ポイント振れる（同じコードで 53.3% / 45.8% / 36.7%）。2 ブロックでも
  誤判定した（電池閾値 99.5% は 2 列で +2.5 と出たが 3 列目で逆転し、実際は誤差）。
- `A.skipUI(true)` を呼ぶと HUD の描画を飛ばして 4.1 倍速くなる。結果は不変。
- 打ち切りは 800 秒で十分。1400 秒に延ばしてもクリア数は変わらない。


## 高速化（2026-08-09）

1 試行 1 プロセスを崩さずに測っていたが、これは 1.36 秒の起動を毎回
払っている。まとめて回すと結果が変わる（状態の持ち越し）ことが以前
分かっていたので避けていた。原因を 3 つ特定して潰した。

- `botReset()` の書き忘れ。並べ書きだったので項目を増やすたび漏れる。
  実測で `BOT.useCd`（-164 秒）と `BOT.glanceT` が持ち越されていた。
  初期値を `BOT_INIT` / `EAR_INIT` に控え、そこから戻す方式に変更。
- `player.vx` / `player.vz` を `startGame()` が戻していなかった。
  タイトルへ戻って遊び直すと、前の周回の終了時の速度で滑り出す。
- 仮想時計。`dt = (now - lastT)/1000` は now が 80 万 ms になると
  丸めで 1e-10 ほどずれ、0.25 秒周期のタイマーが 1 フレーム前後する。
  `H.resetTime()` を各試行の前に呼ぶ（1 本ずつ回す側も同じ手順を踏む）。

確認：種 9200-9207 で 1 本ずつ と まとめて が 8/8 完全一致。

- `many.js` … 1 プロセスで複数種を回す
- `runall2.sh <file> <diff> <seed0> <N> <J>` … J 分割して並列
- `WARD7_FAST=1` … 行列更新を止める（結果は一致、9% 速い）
- `leak.js` / `leak3.js` … 持ち越し状態の検出（指紋・フレーム単位の差分）

計測時間：120 本が 5〜6 分 → **80 秒**（4 コア）。

## gpu.js — 実ブラウザ・実 WebGL での検証

harness.js は three.js を実物で動かすが、WebGL 自体はスタブなので
**シェーダは一度もコンパイルされない**。GLSL の誤りも、真っ黒画面も、
巻き方向の裏返りも、すべてそこを素通りする。
gpu.js は Playwright の Chromium（SwiftShader）で本物の HTML を開き、

  - シェーダのコンパイル／リンクの失敗を console error として拾う
  - 実際に描かれた画を PNG で保存する（目視できる唯一の手段）
  - 画面全体の輝度分布を測る（真っ黒・白飛びの検出）

使い方:
    node .tools/gpu.js <html> <quality 0-3> [出力png]
    # 例: node .tools/gpu.js ward7.html 3 shot.png

注意: 既定のフレームバッファは合成後に無効化されるので、readPixels は
必ず requestAnimationFrame の中で呼ぶ。外で呼ぶと必ず真っ黒が返り、
「描けていない」と誤判定する（一度これで嵌まった）。
three.min.js は同ディレクトリのものを page.route で差し込むので、
回線に依存しない。

## 描画まわりの撮影ツール一式

harness.js（スタブ）では画が一枚も出ない。以下はすべて Playwright の
Chromium（SwiftShader）で実 WebGL を通し、PNG を書き出す。

    node .tools/gpu.js        <html> <q> [png]        # 通常視点。輝度分布も出す
    node .tools/hunter-shot.js<html> <q> [png] [dist] [pitch] [noarms]
    node .tools/item-shot.js  <html> [png]            # 拾得物を並べて撮る
    node .tools/prop-shot.js  <html> [png]            # 通路の物。素材を黒に差し替えて画素を測る
    node .tools/door-shot.js  <html> [png] [seed]     # 施錠扉を正面から
    node .tools/lamp-shot.js  <html> [png]            # 電源を入れて非常灯を見上げる
    node .tools/end-shot.js   <html>                  # 死亡／脱出の画面
    node .tools/tour.js       <html> [枚数] [間隔ms]  # ボットに歩かせて一定間隔で撮る
    node .tools/viewport-shot.js <html> <W> <H> [png] # 実機サイズ（dpr=3）
    node .tools/tex-dump.js   <html> [png]            # 焼いたテクスチャを壁色の上に出す
    node .tools/zone-check.js                         # 9区画の色調を頂点色から集計
    node .tools/seedcheck.js                          # 品質を変えても同じ種で同じ間取りか

撮るときの落とし穴を 3 つ、実際に嵌まった順に：

1. 既定のフレームバッファは合成後に無効化される。readPixels は必ず
   requestAnimationFrame の中で呼ぶこと。外だと必ず真っ黒が返り、
   「描けていない」と誤判定する。
2. タイトル画面ではキャンバスが合成されず、Playwright のスクリーンショットは
   必ず黒く写る（クリア色を赤にしても黒）。readPixels では中身が出るので、
   タイトルの見た目は実機でしか確認できない。
3. 画面の一部を矩形で切って測るとほぼ確実に腕やランプが混ざる。
   追跡者は freeze チートで止めて表示/非表示の差、小物は素材を黒に
   差し替えた差、で対象の画素だけを取る。

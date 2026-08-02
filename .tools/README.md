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

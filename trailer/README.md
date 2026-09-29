# トレーラー

## `ward7_trailer_hq.mp4`（56.5 秒・1920×1080・24fps・シネスコ 2.39:1）

撮影から仕上げ・音楽まで JavaScript で作った版。映像はすべて実際のゲーム（最高品質）を、映画のカメラで撮り直したもの。
作り方は `cinema/` にある。

- `cinema/timeline.js` … 台本。区間（文字・ショット・黒・題名）と音の出来事の時刻表。3 つのスクリプトが同じ表を読む
- `cinema/shots.js` … ショットごとの演出とカメラ（廊下を滑る・望遠で寄る・見上げて回り込む・顔・灯りが消える・走って迫る・捕まる）
- `cinema/grade.js` … ページの中の仕上げ（WebGL2）：色調・ハレーション・周辺減光・フィルムの粒子・ゲートの揺れ・シネスコの帯・字幕のアニメーション
- `cinema/capture.js` … ゲームを仮想時計で 1 コマずつ進めて撮る（`node capture.js <ショット名> [preview]`、`node capture.js text`）
- `cinema/score.js` … 音楽（OfflineAudioContext）：重低音・不協和な弦・「ブワーン」・打撃・せり上がり・加速する脈動・心音・壊れたオルゴール、院長の録音テープと空調の音
- `cinema/make.js` … 区間をつなぎ（速いショットは 2 枚を重ねてモーションブラー）、音を合わせる

順番：`capture.js` を各ショットと `text` で回す → `node score.js` → `node make.js`。連番は `cinema/out/`（git には入れない）。
要るもの：Chromium（Playwright）・ffmpeg・fonts-noto-cjk。

## `ward7_trailer.mp4`（49 秒・1280×720・最初の版）

- `shoot.js` … ゲームを仮想時計で 1 コマずつ進めて撮る（`node shoot.js <ショット名> [preview]`）
- `shots.js` … ショットごとのカメラと追跡者の動き（廊下・奥に立つ・顔・灯りを消す・追われる・捕まる）
- `assemble.py` … 文字の画面（Noto Serif CJK）・語り（院長の録音テープ）・空調の持続音・唸り・心音・打撃音を合わせて 1 本にする

要るもの：Chromium（Playwright）・ffmpeg・Python（numpy・Pillow）・fonts-noto-cjk。
スクリプトの中のパスは作業した場所（/tmp/claude-0/trailer）のまま。

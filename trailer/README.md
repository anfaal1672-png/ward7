# トレーラー

`ward7_trailer.mp4`（49 秒・1280×720・24fps・音声つき）。映像はすべて実際のゲーム画面（最高品質）。

- `shoot.js` … ゲームを仮想時計で 1 コマずつ進めて撮る（`node shoot.js <ショット名> [preview]`）
- `shots.js` … ショットごとのカメラと追跡者の動き（廊下・奥に立つ・顔・灯りを消す・追われる・捕まる）
- `assemble.py` … 文字の画面（Noto Serif CJK）・語り（院長の録音テープ）・空調の持続音・唸り・心音・打撃音を合わせて 1 本にする

要るもの：Chromium（Playwright）・ffmpeg・Python（numpy・Pillow）・fonts-noto-cjk。
スクリプトの中のパスは作業した場所（/tmp/claude-0/trailer）のまま。

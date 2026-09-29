/* トレーラーの台本。撮影（capture.js）・仕上げ（grade.js）・音楽（score.js）が同じ時刻表を読む。
   時刻はすべて秒。映像は 24fps、1920×1080（シネスコ 2.39:1 の帯は仕上げが描く） */
const T = {
  fps: 24, W: 1920, H: 1080, band: 804,           // 帯の内側の高さ（1920/2.39）
  segments: [
    { at: 0.0,  dur: 5.0, kind: 'card',  text: ['昭和六十二年'], sub: '第七病棟 夜間巡回記録' },
    { at: 5.0,  dur: 6.0, kind: 'shot',  shot: 'corridor', fin: 0.6 },
    { at: 11.0, dur: 2.0, kind: 'card',  text: ['閉鎖された病棟に'] },
    { at: 13.0, dur: 6.0, kind: 'shot',  shot: 'reveal', expo: 0.9 },
    { at: 19.0, dur: 2.0, kind: 'card',  text: ['患者たちは、まだいる'] },
    { at: 21.0, dur: 5.0, kind: 'shot',  shot: 'orbit', fin: 0.12, fout: 0, expo: 0.85 },
    { at: 26.0, dur: 3.0, kind: 'shot',  shot: 'face', fin: 0, fout: 0.35, expo: 0.62 },
    { at: 29.0, dur: 1.5, kind: 'black' },
    { at: 30.5, dur: 4.5, kind: 'shot',  shot: 'dark', fin: 0.3, fout: 0 },
    { at: 35.0, dur: 1.0, kind: 'card',  text: ['灯りを消せば'], fast: true },
    { at: 36.0, dur: 2.5, kind: 'shot',  shot: 'sprint', fin: 0, fout: 0, expo: 0.72 },
    { at: 38.5, dur: 1.5, kind: 'shot',  shot: 'grab', fin: 0, fout: 0, expo: 0.75 },
    { at: 40.0, dur: 6.0, kind: 'black' },
    { at: 46.0, dur: 6.0, kind: 'title' },
    { at: 52.0, dur: 4.5, kind: 'card',  text: ['iPhone ／ Web で配信中'], sub: 'anfaal1672-png.github.io/ward7', small: true },
  ],
  // fin/fout … 端の暗転（秒）、expo … 露出（追跡者の白い肌が飛ばないように下げる）
  // 語り：院長の録音テープ（assets/voice）。[テープ, 行, 置く時刻]
  vo: [[1, 0, 0.9], [1, 1, 5.6], [2, 1, 13.9], [7, 2, 21.4], [7, 4, 41.2]],
  // 音の出来事（score.js）
  impacts: [11.0, 13.0, 21.0, 26.0, 35.0, 36.0, 38.5, 46.0],
  braams: [29.0, 46.0],
  risers: [[24.5, 29.0], [33.4, 35.0], [37.0, 40.0]],
  pulse: [26.0, 40.0],        // 加速する脈動
  heart: [30.5, 40.0],
  silenceAt: 40.0,            // ここで音楽を断ち切る
  lullaby: [42.5, 56.5],      // 壊れたオルゴール
};
T.total = T.segments.reduce((m, s) => Math.max(m, s.at + s.dur), 0);
if (typeof module !== 'undefined') module.exports = T;

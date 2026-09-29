/* 編集。撮った連番（out/NN/）を区間ごとに動画にし（sub:2 のショットは 2 枚を重ねてモーションブラー）、
   つないで音楽（out/score.wav）を合わせ、trailer/ward7_trailer_hq.mp4 を書く。
   node make.js */
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path');
const T = require('./timeline.js'), SHOTS = require('./shots.js');
const OUT = process.env.W7_OUT || path.join(__dirname, 'out');
const FINAL = path.join(__dirname, '..', 'ward7_trailer_hq.mp4');
const ff = (...a) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...a], { stdio: 'inherit' });
const X264 = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-tune', 'film', '-pix_fmt', 'yuv420p', '-r', String(T.fps)];

const parts = [];
T.segments.forEach((seg, si) => {
  const dir = path.join(OUT, String(si).padStart(2, '0')), N = Math.round(seg.dur*T.fps);
  const sub = seg.kind === 'shot' ? (SHOTS[seg.shot].sub || 1) : 1;
  const have = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.png')).length : 0;
  if(have < N*sub) throw new Error(`区間 ${si}（${seg.shot || seg.kind}）のコマが足りない：${have}/${N*sub}`);
  const vf = sub > 1 ? `tmix=frames=${sub},select='not(mod(n+1\\,${sub}))',setpts=N/${T.fps}/TB` : 'null';
  const out = path.join(OUT, `seg${String(si).padStart(2, '0')}.mp4`);
  ff('-framerate', String(T.fps*sub), '-i', path.join(dir, '%05d.png'), '-vf', vf, '-frames:v', String(N), ...X264, out);
  parts.push(out);
});
const list = path.join(OUT, 'list.txt');
fs.writeFileSync(list, parts.map(p => `file '${p}'\n`).join(''));
const video = path.join(OUT, 'video.mp4');
ff('-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', video);
ff('-i', video, '-i', path.join(OUT, 'score.wav'), '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k',
   '-shortest', '-movflags', '+faststart', FINAL);
console.log('書いた', FINAL, (fs.statSync(FINAL).size/1e6).toFixed(1) + 'MB', T.total + '秒');

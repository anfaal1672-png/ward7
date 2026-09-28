/* 録音テープの声（設計指示書 第 11.5 節）。game/src/ts/12b-tapes.ts の台詞を Open JTalk
   （nitech_jp_atr503_m001 の男声、CC BY 3.0）で読み上げ、1987 年のカセットに口述した音へ加工して
   assets/voice/tape_<番号>.mp3 と、行ごとの区切りの時刻 assets/voice/tapes.json を書く。
   加工：揺れ（ワウ 0.55Hz・フラッター 6.8Hz）→ 帯域を電話より少し広い 200Hz〜3.8kHz に →
   テープの飽和 → 狭い事務室の初期反射 → ヒスと電源のうなり（50Hz）→ ときどきの音の落ち込み → 再生・停止の機械音。
   合成音声の平板さは、この加工とテープという建て付けでかなり隠れる。人が収録したら同じ名前の MP3 に差し替えれば
   よい（区切りの時刻だけ tapes.json を合わせる）。
   要るもの: open_jtalk・naist-jdic・hts-voice-nitech-jp-atr503-m001・lame（apt で入る）
   使い方: node .tools/voice-bake.js */
const fs = require('fs'), path = require('path'), os = require('os'), { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'assets', 'voice');
const DIC = process.env.JTALK_DIC || '/var/lib/mecab/dic/open-jtalk/naist-jdic';
const VOX = process.env.JTALK_VOICE || '/usr/share/hts-voice/nitech-jp-atr503-m001/nitech_jp_atr503_m001.htsvoice';
const SR = 48000;

// 台詞は源から読む（二重に持たない）
const src = fs.readFileSync(path.join(ROOT, 'game', 'src', 'ts', '12b-tapes.ts'), 'utf8');
const lit = src.slice(src.indexOf('var TAPES = ') + 12, src.indexOf('\n];') + 3);
const TAPES = Function('return ' + lit)();

function mulberry32(a){ return function(){ a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function readWav(f){
  const b = fs.readFileSync(f); let o = 12, fmt = null, data = null;
  while(o < b.length){ const id = b.toString('ascii', o, o+4), n = b.readUInt32LE(o+4);
    if(id === 'fmt ') fmt = { ch:b.readUInt16LE(o+10), sr:b.readUInt32LE(o+12) };
    if(id === 'data') data = b.subarray(o+8, o+8+n);
    o += 8 + n + (n & 1); }
  const out = new Float32Array(data.length / 2 / fmt.ch);
  for(let i=0; i<out.length; i++) out[i] = data.readInt16LE(i*2*fmt.ch) / 32768;
  if(fmt.sr !== SR) throw new Error('標本化周波数が ' + fmt.sr);
  return out;
}
function writeWav(f, x, sr){
  const b = Buffer.alloc(44 + x.length*2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length*2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr*2, 28);
  b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length*2, 40);
  for(let i=0; i<x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i]*32767))), 44 + i*2);
  fs.writeFileSync(f, b);
}
// 2 次の IIR（RBJ）
function biquad(x, type, f0, q){
  const w = 2*Math.PI*f0/SR, c = Math.cos(w), s = Math.sin(w), al = s/(2*q);
  let b0, b1, b2, a0 = 1 + al, a1 = -2*c, a2 = 1 - al;
  if(type === 'lp'){ b0 = (1-c)/2; b1 = 1-c; b2 = (1-c)/2; } else { b0 = (1+c)/2; b1 = -(1+c); b2 = (1+c)/2; }
  const y = new Float32Array(x.length); let x1=0, x2=0, y1=0, y2=0;
  for(let i=0; i<x.length; i++){ const v = (b0*x[i] + b1*x1 + b2*x2 - a1*y1 - a2*y2)/a0; x2=x1; x1=x[i]; y2=y1; y1=v; y[i]=v; }
  return y;
}
function synth(line, tmp){
  const t = path.join(tmp, 'l.txt'), w = path.join(tmp, 'l.wav');
  fs.writeFileSync(t, line);
  execFileSync('open_jtalk', ['-x', DIC, '-m', VOX, '-r', '0.93', '-fm', '-2.5', '-jf', '1.1', '-a', '0.56', '-ow', w, t]);
  const x = readWav(w);
  // 前後の無音を切る
  let a = 0, b = x.length - 1;
  while(a < b && Math.abs(x[a]) < 0.004) a++;
  while(b > a && Math.abs(x[b]) < 0.004) b--;
  return x.subarray(Math.max(0, a - 480), Math.min(x.length, b + 960));
}
function click(y, at, R, big){
  const n = Math.round(0.045*SR);
  for(let i=0; i<n; i++){
    const e = Math.exp(-i/(0.006*SR)), thump = Math.sin(2*Math.PI*95*i/SR) * Math.exp(-i/(0.02*SR));
    y[at+i] += (R()*2-1) * e * (big ? 0.5 : 0.3) + thump * (big ? 0.35 : 0.2);
  }
}

fs.mkdirSync(OUT, { recursive:true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ward7-voice-'));
const times = [];
TAPES.forEach(function(tp, ti){
  const R = mulberry32(0x7A9E + ti*977);
  const lines = tp[1], parts = lines.map(l => synth(l, tmp));
  const LEAD = 0.9, GAP = 0.75, TAIL = 1.0;
  let len = LEAD*SR + TAIL*SR; parts.forEach(p => len += p.length + GAP*SR);
  const dry = new Float32Array(Math.round(len));
  const tt = []; let at = Math.round(LEAD*SR);
  parts.forEach(function(p){ tt.push([+(at/SR).toFixed(2), +((at + p.length)/SR).toFixed(2)]); dry.set(p, at); at += p.length + Math.round(GAP*SR); });
  times.push(tt);
  // 揺れ：読み出し位置を少しずつ前後させる（音程が揺れる）
  const wow = new Float32Array(dry.length), ph1 = R()*6, ph2 = R()*6;
  for(let i=0; i<dry.length; i++){
    const t = i/SR, d = (0.0021*Math.sin(2*Math.PI*0.55*t + ph1) + 0.00035*Math.sin(2*Math.PI*6.8*t + ph2)) * SR + 150;
    const p = i - d, k = Math.floor(p), f = p - k;
    wow[i] = (k >= 0 && k+1 < dry.length) ? dry[k]*(1-f) + dry[k+1]*f : 0;
  }
  let y = biquad(biquad(wow, 'hp', 200, 0.7), 'lp', 3800, 0.8);
  y = biquad(y, 'lp', 5200, 0.6);
  // 声の大きさを揃えてから飽和させる
  let pk = 0; for(const v of y) pk = Math.max(pk, Math.abs(v));
  const drive = 1.8;
  for(let i=0; i<y.length; i++) y[i] = Math.tanh(drive * y[i] / pk) / Math.tanh(drive);
  // 狭い事務室の初期反射
  const r1 = Math.round(0.011*SR), r2 = Math.round(0.023*SR), r3 = Math.round(0.037*SR);
  for(let i=y.length-1; i>=r3; i--) y[i] += 0.22*y[i-r1] + 0.12*y[i-r2] + 0.06*y[i-r3];
  // 音の落ち込み（テープの傷み）。1 本に 1〜3 か所、声のある所へ
  const drops = 1 + Math.floor(R()*3);
  for(let d=0; d<drops; d++){
    const seg = tt[Math.floor(R()*tt.length)], c = Math.round((seg[0] + R()*(seg[1]-seg[0]))*SR), w = Math.round((0.05 + R()*0.09)*SR);
    for(let i=-w; i<w; i++){ if(c+i < 0 || c+i >= y.length) continue; y[c+i] *= 1 - 0.6*Math.cos(Math.PI*i/(2*w)); }
  }
  // ヒス・うなり
  let hiss = new Float32Array(y.length); for(let i=0; i<hiss.length; i++) hiss[i] = R()*2 - 1;
  hiss = biquad(biquad(hiss, 'hp', 1800, 0.7), 'lp', 7000, 0.7);
  for(let i=0; i<y.length; i++){
    const t = i/SR, fade = Math.min(1, t/0.15, (y.length/SR - t)/0.2);
    y[i] = y[i]*0.72 + hiss[i]*0.05*fade + (Math.sin(2*Math.PI*50*t)*0.006 + Math.sin(2*Math.PI*100*t)*0.003)*fade;
  }
  click(y, Math.round(0.08*SR), R, true);                 // 再生ボタン
  click(y, y.length - Math.round(0.35*SR), R, false);     // 停止
  pk = 0; for(const v of y) pk = Math.max(pk, Math.abs(v));
  for(let i=0; i<y.length; i++) y[i] *= 0.7 / pk;          // -3dB
  const w = path.join(tmp, 't.wav'), o = path.join(OUT, 'tape_' + (ti+1) + '.mp3');
  writeWav(w, y, SR);
  execFileSync('lame', ['--quiet', '-m', 'm', '--resample', '22.05', '-b', '40', w, o]);
  console.log(o, (y.length/SR).toFixed(1) + 's', fs.statSync(o).size + 'B');
});
fs.writeFileSync(path.join(OUT, 'tapes.json'), JSON.stringify(times) + '\n');
fs.rmSync(tmp, { recursive:true, force:true });

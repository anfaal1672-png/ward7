/* 音楽。ブラウザの OfflineAudioContext で timeline.js の時刻表どおりに書き、WAV（48kHz ステレオ）にする。
   重低音・不協和な弦・「ブワーン」・打撃・せり上がり・加速する脈動・心音・壊れたオルゴール、
   その上に院長の録音テープ（assets/voice）と空調の持続音（assets/sfx）。
   node score.js [出力.wav] */
const { chromium, EXEC } = require('/home/user/ward7/.tools/pw.js');
const fs = require('fs'), path = require('path');
const T = require('./timeline.js');
const ASSETS = '/home/user/ward7/assets';
const OUTF = process.argv[2] || path.join(process.env.W7_OUT || path.join(__dirname, 'out'), 'score.wav');

function compose(T, files){
  const SR = 48000, N = Math.ceil(T.total*SR);
  const ctx = new OfflineAudioContext(2, N, SR);
  const b64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0)).buffer;
  const rnd = (() => { let s = 7; return () => (s = (s*16807) % 2147483647)/2147483647; })();

  // ---- 行き先：音楽の束（テープの間は下げる）→ 圧縮 → 出力。残響は共通 ----
  const master = ctx.createDynamicsCompressor();
  master.threshold.value = -14; master.ratio.value = 3.5; master.attack.value = 0.01; master.release.value = 0.25;
  master.connect(ctx.destination);
  const music = ctx.createGain(); music.connect(master);
  const verb = ctx.createConvolver(); const verbOut = ctx.createGain(); verbOut.gain.value = 0.55;
  { const L = 4.2*SR, ir = ctx.createBuffer(2, L, SR);
    for(let c = 0; c < 2; c++){ const d = ir.getChannelData(c); for(let i = 0; i < L; i++){ const t = i/SR; d[i] = (rnd()*2 - 1)*Math.exp(-t*1.55)*(t < 0.012 ? t/0.012 : 1); } }
    verb.buffer = ir; }
  verb.connect(verbOut); verbOut.connect(music);
  const send = (node, g) => { const s = ctx.createGain(); s.gain.value = g; node.connect(s); s.connect(verb); };
  // 断ち切り：silenceAt で音楽を止め、題名の前から戻す
  music.gain.setValueAtTime(1, 0);
  music.gain.setValueAtTime(1, T.silenceAt - 0.01); music.gain.linearRampToValueAtTime(0, T.silenceAt + 0.005);
  music.gain.setValueAtTime(0, T.lullaby[0] - 0.6); music.gain.linearRampToValueAtTime(1, T.lullaby[0] - 0.1);
  // テープの間は音楽を下げる（ダッキング）
  const duck = ctx.createGain(); duck.connect(music);
  const vseg = T.vo.map(([tp, ln, at]) => { const [a, b] = files.times[tp - 1][ln]; return [at, at + (b - a)]; });
  duck.gain.setValueAtTime(1, 0);
  vseg.forEach(([a, b]) => { duck.gain.setTargetAtTime(0.55, a - 0.15, 0.08); duck.gain.setTargetAtTime(1, b + 0.2, 0.3); });
  const bus = duck;

  const noiseBuf = (() => { const B = ctx.createBuffer(1, SR*2, SR), d = B.getChannelData(0); for(let i = 0; i < d.length; i++) d[i] = rnd()*2 - 1; return B; })();
  const noise = (t0, t1) => { const n = ctx.createBufferSource(); n.buffer = noiseBuf; n.loop = true; n.start(t0); n.stop(t1); return n; };
  const osc = (type, f, t0, t1) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(t0); o.stop(t1); return o; };

  // ---- 空調（ゲームの素材）を敷く。捕まった後は遠く ----
  return Promise.all([ctx.decodeAudioData(b64(files.amb)), ...files.tapes.map(t => ctx.decodeAudioData(b64(t)))]).then(([amb, ...tapes]) => {
    { const s = ctx.createBufferSource(); s.buffer = amb; s.loop = true; s.start(0);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 60;
      const g = ctx.createGain(); g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.42, 3);
      g.gain.setValueAtTime(0.42, T.silenceAt); g.gain.linearRampToValueAtTime(0.12, T.silenceAt + 0.05); g.gain.linearRampToValueAtTime(0.06, T.total);
      s.connect(hp); hp.connect(g); g.connect(master); }

    // ---- 重低音：D1 と少しずれた五度。脈動の区間から厚く ----
    { const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 140;
      [36.71, 36.95, 55.0, 73.42].forEach((f, i) => { const o = osc(i < 2 ? 'sine' : 'triangle', f, 0, T.silenceAt + 0.1); const og = ctx.createGain(); og.gain.value = [0.5, 0.4, 0.18, 0.1][i]; o.connect(og); og.connect(lp); });
      lp.connect(g); g.connect(bus);
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(0.35, 10); g.gain.linearRampToValueAtTime(0.5, 26); g.gain.linearRampToValueAtTime(0.85, T.silenceAt); }

    // ---- 不協和な弦：D・E♭・E・A♭ の塊が、ゆっくり開いたり閉じたりする ----
    { const g = ctx.createGain(), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.7;
      lp.frequency.setValueAtTime(300, 5); lp.frequency.linearRampToValueAtTime(900, 20); lp.frequency.linearRampToValueAtTime(2600, T.silenceAt);
      [146.83, 155.56, 164.81, 207.65, 293.66, 311.13].forEach((f, i) => {
        for(const d of [-7, 6]){ const o = osc('sawtooth', f, 4, T.silenceAt + 0.1); o.detune.value = d + (rnd() - 0.5)*4;
          const vib = osc('sine', 4.3 + rnd(), 4, T.silenceAt + 0.1), vg = ctx.createGain(); vg.gain.value = 3; vib.connect(vg); vg.connect(o.detune);
          const og = ctx.createGain(); og.gain.value = i < 4 ? 0.05 : 0.03; o.connect(og); og.connect(lp); } });
      const trem = osc('sine', 0.17, 4, T.silenceAt + 0.1), tg = ctx.createGain(); tg.gain.value = 0.25; trem.connect(tg); tg.connect(g.gain);
      lp.connect(g); g.connect(bus); send(g, 0.5);
      g.gain.setValueAtTime(0, 4); g.gain.linearRampToValueAtTime(0.35, 12); g.gain.linearRampToValueAtTime(0.28, 20); g.gain.linearRampToValueAtTime(0.7, 29); g.gain.linearRampToValueAtTime(1.0, T.silenceAt); }

    // ---- ブワーン：低い金管の塊を歪ませ、フィルタを一気に開いて閉じる ----
    const shaper = ctx.createWaveShaper();
    { const c = new Float32Array(2048); for(let i = 0; i < c.length; i++){ const x = i/1023.5 - 1; c[i] = Math.tanh(x*3.2); } shaper.curve = c; shaper.oversample = '4x'; }
    const braamBus = ctx.createGain(); braamBus.gain.value = 0.9; shaper.connect(braamBus); braamBus.connect(bus); send(braamBus, 0.9);
    T.braams.forEach(at => {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 2.5;
      lp.frequency.setValueAtTime(120, at); lp.frequency.exponentialRampToValueAtTime(2400, at + 0.18); lp.frequency.exponentialRampToValueAtTime(260, at + 3.4);
      const g = ctx.createGain(); g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(0.5, at + 0.05); g.gain.setTargetAtTime(0, at + 0.9, 1.1);
      [36.71, 73.42, 110.0, 146.83, 155.56].forEach((f, i) => { for(const d of [-9, 0, 11]){ const o = osc('sawtooth', f, at, at + 6); o.detune.value = d;
        o.detune.setValueAtTime(d, at); o.detune.linearRampToValueAtTime(d - 40, at + 5);             // 沈みながら消える
        const og = ctx.createGain(); og.gain.value = i < 2 ? 0.22 : 0.12; o.connect(og); og.connect(lp); } });
      lp.connect(g); g.connect(shaper); });

    // ---- 打撃：落ちていく低音＋雑音の叩き、残響へ ----
    T.impacts.forEach((at, k) => {
      const big = T.braams.includes(at) ? 1.2 : 1;
      const o = osc('sine', 90, at, at + 2.5); o.frequency.setValueAtTime(90, at); o.frequency.exponentialRampToValueAtTime(28, at + 1.2);
      const og = ctx.createGain(); og.gain.setValueAtTime(0.9*big, at); og.gain.setTargetAtTime(0, at + 0.02, 0.45); o.connect(og); og.connect(bus);
      const n = noise(at, at + 1.2), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900 + 400*(k % 3); bp.Q.value = 0.8;
      const ng = ctx.createGain(); ng.gain.setValueAtTime(0.7*big, at); ng.gain.setTargetAtTime(0, at + 0.005, 0.07); n.connect(bp); bp.connect(ng); ng.connect(bus);
      send(og, 0.35); send(ng, 1.2); });

    // ---- せり上がり：雑音の帯とうねる音が上がっていき、端で途切れる ----
    T.risers.forEach(([a, b]) => {
      const n = noise(a, b), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(250, a); bp.frequency.exponentialRampToValueAtTime(7000, b);
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, a); g.gain.exponentialRampToValueAtTime(0.5, b - 0.02); g.gain.linearRampToValueAtTime(0, b);
      n.connect(bp); bp.connect(g); g.connect(bus); send(g, 0.4);
      [1, 1.059].forEach(r => { const o = osc('sawtooth', 110*r, a, b); o.frequency.setValueAtTime(110*r, a); o.frequency.exponentialRampToValueAtTime(880*r, b);
        const lp = ctx.createBiquadFilter(); lp.frequency.value = 1800; const og = ctx.createGain();
        og.gain.setValueAtTime(0.0001, a); og.gain.exponentialRampToValueAtTime(0.09, b - 0.02); og.gain.linearRampToValueAtTime(0, b);
        o.connect(lp); lp.connect(og); og.connect(bus); }); });

    // ---- 加速する脈動（低い太鼓） ----
    { let t = T.pulse[0], iv = 0.78;
      while(t < T.pulse[1] - 0.05){
        const o = osc('sine', 62, t, t + 0.5); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.12);
        const g = ctx.createGain(); const lv = 0.35 + 0.35*(t - T.pulse[0])/(T.pulse[1] - T.pulse[0]);
        g.gain.setValueAtTime(lv, t); g.gain.setTargetAtTime(0, t + 0.01, 0.09); o.connect(g); g.connect(bus);
        const n = noise(t, t + 0.05), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
        const ng = ctx.createGain(); ng.gain.setValueAtTime(lv*0.25, t); ng.gain.setTargetAtTime(0, t, 0.01); n.connect(hp); hp.connect(ng); ng.connect(bus);
        t += iv; iv = Math.max(0.16, iv*0.93); } }

    // ---- 心音 ----
    { let t = T.heart[0], bpm = 64;
      while(t < T.heart[1] - 0.1){
        [[0, 1], [0.22, 0.65]].forEach(([off, a]) => { const s = t + off; const o = osc('sine', 46, s, s + 0.3);
          const lp = ctx.createBiquadFilter(); lp.frequency.value = 120; const g = ctx.createGain();
          g.gain.setValueAtTime(0, s); g.gain.linearRampToValueAtTime(0.75*a, s + 0.012); g.gain.setTargetAtTime(0, s + 0.02, 0.05);
          o.connect(lp); lp.connect(g); g.connect(master); });
        bpm = Math.min(158, bpm*1.075); t += 60/bpm; } }

    // ---- 壊れたオルゴール：小さな五音の旋律。ねじが切れて遅くなり、音程も下がっていく ----
    { const D5 = 587.33, st = n => D5*Math.pow(2, n/12);
      // 0=D 3=F 5=G 7=A 10=C 12=D（オリジナルの旋律）
      const mel = [7, 3, 5, 0, null, 7, 3, 5, null, 10, 7, 5, 3, 5, 0, null, 12, 10, 7, 5, 7, 3, null, 5, 3, 0, null, null, -2, 0];
      const box = ctx.createGain(); box.gain.value = 0.55; const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 350;
      box.connect(hp); hp.connect(music); send(box, 1.4);
      let t = T.lullaby[0], beat = 0.36;
      mel.forEach((n, i) => {
        const k = i/mel.length, sag = -k*k*95 + (rnd() - 0.5)*18;        // 最後の方ほど平たく（セント）
        if(n !== null){
          const f = st(n)*Math.pow(2, sag/1200);
          [[1, 0.6, 2.2], [2.76, 0.18, 5.5], [5.4, 0.08, 9], [8.9, 0.03, 14]].forEach(([r, a, dec]) => {
            const o = osc('sine', f*r, t, t + 3); const g = ctx.createGain();
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.003); g.gain.setTargetAtTime(0, t + 0.004, 1/dec);
            o.connect(g); g.connect(box); });
          const c = noise(t, t + 0.02), cg = ctx.createGain(); cg.gain.setValueAtTime(0.05, t); cg.gain.setTargetAtTime(0, t, 0.004); c.connect(cg); cg.connect(box);
        }
        t += beat*(1 + (rnd() - 0.5)*0.12); beat *= 1.035; });
    }

    // ---- 院長のテープ ----
    T.vo.forEach(([tp, ln, at]) => {
      const [a, b] = files.times[tp - 1][ln]; const s = ctx.createBufferSource(); s.buffer = tapes[tp - 1];
      const g = ctx.createGain(); g.gain.value = 1.25;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 110;
      s.connect(hp); hp.connect(g); g.connect(master); send(g, 0.12);
      s.start(at, Math.max(0, a - 0.08), (b - a) + 0.45); });

    return ctx.startRendering();
  }).then(buf => {
    // 16bit にして返す
    const L = buf.getChannelData(0), R = buf.getChannelData(1); let pk = 0;
    for(let i = 0; i < L.length; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
    const g = 0.89/pk, out = new Int16Array(L.length*2);
    for(let i = 0; i < L.length; i++){ out[2*i] = Math.round(L[i]*g*32767); out[2*i + 1] = Math.round(R[i]*g*32767); }
    const u8 = new Uint8Array(out.buffer); let s = ''; for(let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
    return { sr: SR, pk, data: btoa(s) };
  });
}

(async () => {
  const b = await chromium.launch({ executablePath: EXEC, args: ['--no-sandbox'] });
  const p = await b.newPage(); p.on('console', m => console.log('page:', m.text()));
  const files = {
    times: JSON.parse(fs.readFileSync(path.join(ASSETS, 'voice', 'tapes.json'), 'utf8')),
    tapes: [1, 2, 3, 4, 5, 6, 7].map(i => fs.readFileSync(path.join(ASSETS, 'voice', `tape_${i}.mp3`)).toString('base64')),
    amb: fs.readFileSync(path.join(ASSETS, 'sfx', 'amb_hvac_0.wav')).toString('base64'),
  };
  const r = await p.evaluate(`(${compose})(${JSON.stringify(T)}, ${JSON.stringify(files)})`);
  const pcm = Buffer.from(r.data, 'base64'), h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20); h.writeUInt16LE(2, 22); h.writeUInt32LE(r.sr, 24); h.writeUInt32LE(r.sr*4, 28); h.writeUInt16LE(4, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.mkdirSync(path.dirname(OUTF), { recursive: true }); fs.writeFileSync(OUTF, Buffer.concat([h, pcm]));
  console.log('書いた', OUTF, (pcm.length/4/r.sr).toFixed(1) + '秒', 'peak', r.pk.toFixed(2));
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });

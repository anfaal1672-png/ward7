/* 収録素材の音の加工（設計指示書 第 10.1 節「環境音と効果音は収録素材を主にする」）。
   Kenney「Impact Sounds」（CC0）の Ogg を取り寄せ、Chromium の WebAudio で解いて
   22.05kHz・モノラルへ落とし、頭の無音を切り、ピークを -1dB に揃え、足音は高域を少し
   寝かせて（リノリウムと靴底の鈍さ）16bit WAV で assets/sfx/ に書く。
   WAV にするのは、Safari が Ogg Vorbis を解けない版があるため（どの環境でも解ける形にする）。
   原本はリポジトリに置かない（ここで毎回取り寄せる）。出所とライセンスは assets/LICENSES.md。
   使い方: node .tools/sound-bake.js */
const { chromium, EXEC } = require('./pw.js');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const OUT = path.join(__dirname, '..', 'assets', 'sfx');
const CACHE = process.env.ASSET_CACHE || '/tmp/ward7-asset-cache';
const ZIP = 'https://kenney.nl/media/pages/assets/impact-sounds/87b4ddecda-1677589768/kenney_impact-sounds.zip';
// 書き出す名前 ← 原本の名前、足音か（高域を寝かせる）
const PICK = [];
for(let i=0;i<5;i++) PICK.push(['step_hard_'+i, 'footstep_concrete_00'+i, true]);
for(let i=0;i<5;i++) PICK.push(['step_soft_'+i, 'footstep_carpet_00'+i, true]);
for(let i=0;i<3;i++) PICK.push(['glass_'+i, 'impactGlass_heavy_00'+i, false]);
for(let i=0;i<3;i++) PICK.push(['metal_'+i, 'impactMetal_heavy_00'+i, false]);
for(let i=0;i<2;i++) PICK.push(['plate_'+i, 'impactPlate_heavy_00'+i, false]);
/* 環境の持続音（第 10.1 節「病院の空調」）。OpenGameArt「30 CC0 SFX Loops」（rubberduck, CC0）。
   継ぎ目が聞こえないよう、尻の 0.4 秒を頭へ重ねて輪にする（crossfade）。ピークは -6dB */
const OGA_ZIP = 'https://opengameart.org/sites/default/files/sfx_loops.zip';
const LOOPS = [ ['amb_hvac_0', 'ambient_01'], ['amb_air_0', 'noise_01'], ['amb_pump_0', 'pump_02'], ['amb_water_0', 'water_flowing'] ];
function wav16(samples, rate){
  const n = samples.length, buf = Buffer.alloc(44 + n*2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n*2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate*2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n*2, 40);
  for(let i=0;i<n;i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i]*32767))), 44 + i*2);
  return buf;
}
(async()=>{
  fs.mkdirSync(CACHE, { recursive:true }); fs.mkdirSync(OUT, { recursive:true });
  const zip = path.join(CACHE, 'kenney_impact-sounds.zip'), dir = path.join(CACHE, 'kenney_impact');
  if(!fs.existsSync(zip)) execFileSync('curl', ['-sSL', '-o', zip, ZIP]);
  if(!fs.existsSync(dir)) execFileSync('unzip', ['-o', '-q', zip, '-d', dir]);
  const b = await chromium.launch({ executablePath:EXEC, args:['--no-sandbox'] });
  const p = await b.newPage();
  for(const [name, src, isStep] of PICK){
    const b64 = fs.readFileSync(path.join(dir, 'Audio', src + '.ogg')).toString('base64');
    const pcm = await p.evaluate(async([b64, isStep])=>{
      const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;
      const tmp = new OfflineAudioContext(1, 1, 44100);
      const dec = await tmp.decodeAudioData(bin);
      const RATE = 22050, len = Math.ceil(dec.duration * RATE);
      const off = new OfflineAudioContext(1, len, RATE);
      const s = off.createBufferSource(); s.buffer = dec;
      let node = s;
      if(isStep){ const f = off.createBiquadFilter(); f.type = 'highshelf'; f.frequency.value = 3200; f.gain.value = -7; s.connect(f); node = f; }
      node.connect(off.destination); s.start();
      const r = await off.startRendering(), d = r.getChannelData(0);
      let a = 0; while(a < d.length && Math.abs(d[a]) < 0.004) a++;          // 頭の無音
      let z = d.length - 1; while(z > a && Math.abs(d[z]) < 0.002) z--;        // 尾の無音
      const cut = d.slice(Math.max(0, a - 20), Math.min(d.length, z + 200));
      let pk = 0; for(const v of cut) pk = Math.max(pk, Math.abs(v));
      const k = pk > 0 ? 0.891 / pk : 1;                                       // -1dB
      return Array.from(cut, v=>v*k);
    }, [b64, isStep]);
    fs.writeFileSync(path.join(OUT, name + '.wav'), wav16(pcm, 22050));
    console.log(name, (pcm.length/22050).toFixed(2)+'s');
  }
  // 環境の持続音（輪にする）
  const oz = path.join(CACHE, 'oga_sfx_loops.zip'), od = path.join(CACHE, 'oga_sfx_loops');
  if(!fs.existsSync(oz)) execFileSync('curl', ['-sSL', '-o', oz, OGA_ZIP]);
  if(!fs.existsSync(od)) execFileSync('unzip', ['-o', '-q', oz, '-d', od]);
  for(const [name, src] of LOOPS){
    const f1 = path.join(od, 'sfx_loops', src + '.ogg'), f2 = path.join(od, src + '.ogg');
    const b64 = fs.readFileSync(fs.existsSync(f1) ? f1 : f2).toString('base64');
    const pcm = await p.evaluate(async(b64)=>{
      const bin = Uint8Array.from(atob(b64), c=>c.charCodeAt(0)).buffer;
      const dec = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(bin);
      const RATE = 22050, len = Math.ceil(dec.duration * RATE), off = new OfflineAudioContext(1, len, RATE);
      const s = off.createBufferSource(); s.buffer = dec; s.connect(off.destination); s.start();
      const x = (await off.startRendering()).getChannelData(0), L = x.length, Fd = Math.min(Math.floor(RATE*0.4), Math.floor(L/4));
      const y = new Float32Array(L - Fd);
      for(let i=0;i<L-Fd;i++){
        if(i < L - 2*Fd) y[i] = x[i + Fd];
        else { const j = i - (L - 2*Fd), t = j / Fd; y[i] = x[i + Fd]*Math.cos(t*Math.PI/2) + x[j]*Math.sin(t*Math.PI/2); }
      }
      let pk = 0; for(const v of y) pk = Math.max(pk, Math.abs(v));
      const k = pk > 0 ? 0.5 / pk : 1;
      return Array.from(y, v=>v*k);
    }, b64);
    fs.writeFileSync(path.join(OUT, name + '.wav'), wav16(pcm, 22050));
    console.log(name, (pcm.length/22050).toFixed(2)+'s（輪）');
  }
  await b.close();
})();

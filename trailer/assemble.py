"""トレーラーの編集：撮った連番・文字の画面・音を 1 本にまとめる。
映像：ゲームの実画面（shoot.js で仮想時計 24fps）。文字は Noto Serif CJK。
音：院長の録音テープ（ゲームの声）を語りに、空調の持続音（ゲームの素材）・低い唸り・心音・打撃音を合成で重ねる。"""
import os, subprocess, json, numpy as np, wave
from PIL import Image, ImageDraw, ImageFont
D = os.path.dirname(os.path.abspath(__file__)); FR = os.path.join(D, 'frames'); OUT = os.path.join(D, 'out'); os.makedirs(OUT, exist_ok=True)
W, H, FPS, SR = 1280, 720, 24, 44100
ASSETS = '/home/user/ward7/assets'
SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SANS = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
def ff(*a): subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', *a], check=True)

# ---- 構成（秒） ----
# (種類, 名前/文, 長さ, 設定)
TL = [
  ('card', ['昭和六十二年', '第七病棟'], 4.0, {}),
  ('shot', 'corridor', 6.5, {}),
  ('card', ['閉鎖された病棟に'], 2.2, {}),
  ('shot', 'reveal', 5.5, {}),
  ('card', ['患者たちは、まだいる'], 2.4, {}),
  ('shot', 'face', 3.5, {}),
  ('card', ['灯りは、命綱だ'], 2.0, {}),
  ('shot', 'dark', 4.5, {}),
  ('card', ['消せば、あれが来る'], 2.0, {}),
  ('shot', 'chase', 2.6, {'cut': True}),
  ('shot', 'death', 1.8, {'cut': True}),
  ('black', None, 3.6, {}),
  ('title', None, 5.0, {}),
  ('card', ['iPhone / Web', 'anfaal1672-png.github.io/ward7'], 3.5, {'small': True}),
]
# 語り（テープ番号, 行番号, 置く時刻）— tapes.json の区切りで切り出す
VO = [(1, 0, 0.6), (1, 1, 4.6), (2, 1, 13.4), (7, 2, 19.0), (7, 4, 37.2)]
# 打撃（時刻, 強さ）と心音の区間
HITS = [(12.7, 0.8), (20.6, 1.0), (27.3, 0.6), (32.6, 1.1), (35.2, 1.3), (40.6, 1.2)]
HEART = (26.1, 35.2)
CAUGHT = 37.0

def card_img(lines, small=False, alpha=1.0):
    im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    f = ImageFont.truetype(SANS if small else SERIF, 34 if small else 46)
    hs = [d.textbbox((0, 0), l, font=f) for l in lines]
    tot = sum(b[3] - b[1] for b in hs) + 26*(len(lines) - 1); y = (H - tot)//2
    for l, b in zip(lines, hs):
        d.text(((W - (b[2]-b[0]))//2, y), l, font=f, fill=(int(214*alpha), int(206*alpha), int(192*alpha))); y += (b[3]-b[1]) + 26
    return im
def title_img():
    im = Image.new('RGB', (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    f1 = ImageFont.truetype(SERIF, 120); f2 = ImageFont.truetype(SERIF, 44)
    for txt, f, y, col in (('WARD 7', f1, 250, (200, 40, 34)), ('第 七 病 棟', f2, 410, (210, 202, 188))):
        b = d.textbbox((0, 0), txt, font=f); d.text(((W-(b[2]-b[0]))//2, y), txt, font=f, fill=col)
    return im

segs = []
for i, (kind, what, dur, opt) in enumerate(TL):
    p = os.path.join(OUT, 'seg%02d.mp4' % i); n = round(dur*FPS)
    fi = 0 if opt.get('cut') else 0.5; fo = 0 if opt.get('cut') else 0.5
    vf = []
    if fi: vf.append('fade=t=in:st=0:d=%.2f' % fi)
    if fo: vf.append('fade=t=out:st=%.2f:d=%.2f' % (dur - fo, fo))
    vf = ','.join(vf + ['format=yuv420p']) if vf else 'format=yuv420p'
    if kind == 'shot':
        src = os.path.join(FR, what)
        ff('-framerate', str(FPS), '-i', os.path.join(src, '%04d.png'), '-frames:v', str(n), '-vf', 'scale=%d:%d,%s' % (W, H, vf), '-c:v', 'libx264', '-crf', '17', '-r', str(FPS), p)
    else:
        img = card_img(what, opt.get('small')) if kind == 'card' else (title_img() if kind == 'title' else Image.new('RGB', (W, H)))
        png = os.path.join(OUT, 'card%02d.png' % i); img.save(png)
        ff('-loop', '1', '-framerate', str(FPS), '-i', png, '-frames:v', str(n), '-vf', vf, '-c:v', 'libx264', '-crf', '17', '-r', str(FPS), p)
    segs.append(p)
open(os.path.join(OUT, 'list.txt'), 'w').write(''.join("file '%s'\n" % s for s in segs))
video = os.path.join(OUT, 'video.mp4')
ff('-f', 'concat', '-safe', '0', '-i', os.path.join(OUT, 'list.txt'), '-c', 'copy', video)
TOTAL = sum(t[2] for t in TL)

# ---- 音 ----
N = int(TOTAL*SR); mix = np.zeros(N)
rng = np.random.default_rng(7)
def load(path):
    tmp = os.path.join(OUT, 'tmp.wav'); ff('-i', path, '-ac', '1', '-ar', str(SR), tmp)
    with wave.open(tmp) as w: x = np.frombuffer(w.readframes(w.getnframes()), '<i2').astype(float)/32768
    return x
def put(x, t, g=1.0):
    i = int(t*SR); j = min(N, i + len(x)); mix[i:j] += g*x[:j-i]
# 空調の持続音（ゲームの素材）を輪にして敷く
amb = load(os.path.join(ASSETS, 'sfx', 'amb_hvac_0.wav'))
reps = np.tile(amb, int(np.ceil(N/len(amb))))[:N]; env = np.ones(N)
tt = np.arange(N)/SR
env *= np.clip(tt/3, 0, 1); env[int(CAUGHT*SR):] *= 0.15            # 捕まった後は引く
mix += reps*env*0.5
# 低い唸り（40Hz と 61Hz のうなり）
drone = (np.sin(2*np.pi*40*tt) + 0.6*np.sin(2*np.pi*61.3*tt))*0.07*np.clip((tt-2)/10, 0, 1)
drone *= (1 + 0.6*np.clip((tt-30)/10, 0, 1)); drone[int(CAUGHT*SR):] *= 0.0
mix += drone
# 語り
times = json.load(open(os.path.join(ASSETS, 'voice', 'tapes.json')))
for tape, line, at in VO:
    x = load(os.path.join(ASSETS, 'voice', 'tape_%d.mp3' % tape))
    a, b = times[tape-1][line]; seg = x[int((a-0.08)*SR):int((b+0.35)*SR)]
    put(seg, at, 1.05)
# 打撃：低いうねりの沈み込み＋雑音の立ち上がり
def hit(strength):
    n = int(2.2*SR); t = np.arange(n)/SR
    boom = np.sin(2*np.pi*(55*np.exp(-t*1.2))*t)*np.exp(-t*1.6)
    noise = rng.standard_normal(n)*np.exp(-t*9)*0.5
    return (boom + noise)*0.55*strength
for at, s in HITS: put(hit(s), at - 0.05)
# 心音（だんだん速く）
t = HEART[0]; bpm = 62
while t < HEART[1]:
    for off, g in ((0, 1.0), (0.24, 0.7)):
        n = int(0.18*SR); x = np.arange(n)/SR
        put(np.sin(2*np.pi*48*x)*np.exp(-x*28)*0.55*g, t + off)
    bpm = min(150, bpm*1.07); t += 60/bpm
# 仕上げ：軽い圧縮と正規化
mix = np.tanh(mix*1.4)/np.tanh(1.4); mix *= 0.89/np.max(np.abs(mix))
aud = os.path.join(OUT, 'audio.wav')
with wave.open(aud, 'wb') as w:
    w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype('<i2').tobytes())
final = os.path.join(D, 'ward7_trailer.mp4')
ff('-i', video, '-i', aud, '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final)
print('書いた', final, '%.1f 秒' % TOTAL)

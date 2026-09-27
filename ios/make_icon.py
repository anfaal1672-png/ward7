#!/usr/bin/env python3
"""アイコンを手続きで描く。

ゲーム本体は「外部アセット 0」で作ってあるので、包装のアイコンも
画像ファイルを置かずにここで生成する（CI がビルド前に走らせる）。
PNG は zlib だけで書けるので、外部ライブラリも使わない。"""
import zlib, struct, math, os, json, sys

OUT = sys.argv[1] if len(sys.argv) > 1 else 'Resources/Assets.xcassets/AppIcon.appiconset'

def png(path, w, h, px):
    raw = b''.join(b'\x00' + bytes(px[y*w*4:(y+1)*w*4]) for y in range(h))
    def chunk(tag, data):
        c = tag + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)
    hdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', hdr)
                + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))

N = 1024
buf = bytearray(N*N*4)
cx = cy = (N-1)/2.0

for y in range(N):
    for x in range(N):
        # 下地：暗いスレート。中心からわずかに明るい
        d = math.hypot(x-cx, y-cy) / (N*0.72)
        v = max(0.0, 1.0 - d*d)
        r = 0.050 + 0.028*v
        g = 0.078 + 0.040*v
        b = 0.082 + 0.042*v
        # 赤い誘導灯の光。右下から差す
        gx, gy = N*0.70, N*0.74
        gd = math.hypot(x-gx, y-gy) / (N*0.52)
        glow = max(0.0, 1.0 - gd) ** 2.2
        r += 0.55*glow; g += 0.09*glow; b += 0.09*glow
        # 走査線。CRT の質感
        if (y // 3) % 2 == 0:
            r *= 0.93; g *= 0.93; b *= 0.93
        i = (y*N + x)*4
        buf[i]   = min(255, int(r*255))
        buf[i+1] = min(255, int(g*255))
        buf[i+2] = min(255, int(b*255))
        buf[i+3] = 255

def stroke(x0, y0, x1, y1, wdt, col):
    """太さのある線分を骨のような色で置く"""
    steps = int(math.hypot(x1-x0, y1-y0)) + 1
    for s in range(steps+1):
        t = s/steps
        px, py = x0 + (x1-x0)*t, y0 + (y1-y0)*t
        rr = int(wdt)
        for dy in range(-rr, rr+1):
            for dx in range(-rr, rr+1):
                dd = math.hypot(dx, dy)
                if dd > wdt: continue
                a = min(1.0, (wdt-dd)/2.2)
                X, Y = int(px+dx), int(py+dy)
                if not (0 <= X < N and 0 <= Y < N): continue
                i = (Y*N + X)*4
                for k in range(3):
                    buf[i+k] = int(buf[i+k]*(1-a) + col[k]*a)

BONE = (232, 226, 212)
# 「7」を大きく引く
stroke(N*0.28, N*0.27, N*0.74, N*0.27, N*0.052, BONE)   # 横棒
stroke(N*0.74, N*0.27, N*0.44, N*0.79, N*0.052, BONE)   # 斜め
stroke(N*0.34, N*0.53, N*0.62, N*0.53, N*0.030, BONE)   # 中の横線

def resize(src, n, m):
    """面積平均で縮小する。最近傍だと 40px で線が消える"""
    out = bytearray(m*m*4)
    r = n/m
    for y in range(m):
        for x in range(m):
            acc = [0, 0, 0, 0]; cnt = 0
            for sy in range(int(y*r), max(int(y*r)+1, int((y+1)*r))):
                for sx in range(int(x*r), max(int(x*r)+1, int((x+1)*r))):
                    if sx >= n or sy >= n: continue
                    i = (sy*n + sx)*4
                    for k in range(4): acc[k] += src[i+k]
                    cnt += 1
            i = (y*m + x)*4
            for k in range(4): out[i+k] = acc[k]//max(1, cnt)
    return out

os.makedirs(OUT, exist_ok=True)
SIZES = [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024]
for s in SIZES:
    png(os.path.join(OUT, 'icon-%d.png' % s), s, s, buf if s == N else resize(buf, N, s))

# Contents.json。Xcode はこれが無いとアイコンを認識しない
def e(size, scale, idiom, px):
    return {"size": size, "idiom": idiom, "filename": "icon-%d.png" % px, "scale": scale}
images = [
    e("20x20","2x","iphone",40), e("20x20","3x","iphone",60),
    e("29x29","2x","iphone",58), e("29x29","3x","iphone",87),
    e("40x40","2x","iphone",80), e("40x40","3x","iphone",120),
    e("60x60","2x","iphone",120), e("60x60","3x","iphone",180),
    e("20x20","1x","ipad",20),  e("20x20","2x","ipad",40),
    e("29x29","1x","ipad",29),  e("29x29","2x","ipad",58),
    e("40x40","1x","ipad",40),  e("40x40","2x","ipad",80),
    e("76x76","1x","ipad",76),  e("76x76","2x","ipad",152),
    e("83.5x83.5","2x","ipad",167),
    {"size":"1024x1024","idiom":"ios-marketing","filename":"icon-1024.png","scale":"1x"},
]
with open(os.path.join(OUT, 'Contents.json'), 'w') as f:
    json.dump({"images": images, "info": {"version": 1, "author": "xcode"}}, f, indent=2)

root = os.path.dirname(OUT)
with open(os.path.join(root, 'Contents.json'), 'w') as f:
    json.dump({"info": {"version": 1, "author": "xcode"}}, f, indent=2)

# 起動画面の背景色（ゲームの --void と同じ）
lc = os.path.join(root, 'LaunchBackground.colorset')
os.makedirs(lc, exist_ok=True)
with open(os.path.join(lc, 'Contents.json'), 'w') as f:
    json.dump({"colors":[{"idiom":"universal","color":{"color-space":"srgb","components":
        {"red":"0.020","green":"0.035","blue":"0.040","alpha":"1.000"}}}],
        "info":{"version":1,"author":"xcode"}}, f, indent=2)

print('アイコン %d 枚を生成' % len(SIZES))

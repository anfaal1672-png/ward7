"""一人称の右手（設計指示書 第 9.4 節「現行の一人称の腕とランプを、手のモデルに差し替える」）。

MakeHuman（CC0）の体から右の前腕と手を切り出し、ランプの胴（半径 2.45cm）を握る形に曲げて
assets/models/hand/ に書く。握りは角度を決め打ちせず、指の各節を順に曲げていき、皮膚が胴の表面に
触れたところで止める（手続きの手で一度失敗した「指が宙に浮いて握っていない」を構造で防ぐ）。
  1. 形の差分：痩せた若い大人（男女の中間）の手
  2. 前腕・手・指 15 節の重みで、節ごとの剛体の回転を重ねる（線形ブレンド）
  3. 胴の軸は人差し指→小指の付け根の並びに沿わせ、手のひらから胴の半径だけ浮かせた所に置く
  4. 小指側へ手首を少し倒し（尺屈）、前腕が胴の後ろへ自然に続くようにする
  5. 胴の軸を +Z（ランプの頭が -Z）、手のひらの向きを -Y にした座標で書き出す
  6. 手の甲と手のひらに巻いた包帯、手首の患者用バンド、爪も同じ皮膚の面から作る
     （面を少し浮かせて切り出すので、手の形に必ず沿う）
出力：meta.json（部分ごとの頂点数・添字・区切り）と mesh.bin（位置・UV 16bit、法線 8bit）。
要るもの: python3・numpy。使い方: python3 .tools/hand-bake.py"""
import json, os, sys
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
import importlib.util
_spec = importlib.util.spec_from_file_location('hb', os.path.join(os.path.dirname(__file__), 'human-bake.py'))
hb = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(hb)

OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models', 'hand')
R_BARREL = 0.0245
SHAPE = [
    ('macrodetails/universal-female-young-averagemuscle-minweight.target', 0.5),
    ('macrodetails/universal-male-young-averagemuscle-minweight.target', 0.5),
    ('macrodetails/asian-female-young.target', 0.5),
    ('macrodetails/asian-male-young.target', 0.5),
]
SIDE = 'R'                       # MakeHuman の .R は -X（体の右）
# 手首を小指側へ倒す角（rad）。ゲームの側で左右を反転して右手の握りにするので、前腕が胴の真下から
# 少しだけ手前へ流れる程度にとどめる（1.00 では前腕が胴に沿って寝て、持ち方がありえない形になった）
ULNAR = float(os.environ.get('ULNAR', '0.30'))
FLEX = float(os.environ.get('FLEX', '0'))   # 手首の掌屈（rad）
FORE_KEEP = 0.26                 # 手首から肘側へ残す長さ（m）

def rodrigues(axis, ang):
    a = axis / np.linalg.norm(axis); K = np.array([[0, -a[2], a[1]], [a[2], 0, -a[0]], [-a[1], a[0], 0]])
    return np.eye(3) + np.sin(ang)*K + (1 - np.cos(ang))*K @ K

def main():
    V0, VT, F, G = hb.load_obj()
    V = V0.copy()
    for rel, w in SHAPE:
        for l in open(hb.get('targets/' + rel)):
            if not l.strip() or l.startswith('#'): continue
            i, x, y, z = l.split(); V[int(i)] += w*np.array([float(x), float(y), float(z)])
    V *= 0.1
    sk = json.load(open(hb.get('rigs/default.mhskel')))
    J = {n: V[idx].mean(axis=0) for n, idx in sk['joints'].items()}
    def jh(b): return J[sk['bones'][b]['head']].copy()
    def jt(b): return J[sk['bones'][b]['tail']].copy()
    W = json.load(open(hb.get('rigs/default_weights.mhw')))['weights']

    s = '.' + SIDE
    bones = ['fore', 'hand'] + ['f%d_%d' % (f, j) for f in range(1, 6) for j in (1, 2, 3)]
    def target(b):
        if not b.endswith(s): return None
        n = b[:-2]
        if n.startswith('lowerarm'): return 'fore'
        if n.startswith(('wrist', 'metacarpal')): return 'hand'
        if n.startswith('finger'):
            f, j = n[6:].split('-'); return 'f%s_%s' % (f, j)
        return None
    nv = len(V); Wt = np.zeros((nv, len(bones))); other = np.zeros(nv)
    for b, lst in W.items():
        t = target(b)
        for vi, w in lst:
            if t is None: other[vi] += w
            else: Wt[vi, bones.index(t)] += w
    tot = Wt.sum(axis=1)
    wrist = jh('wrist' + s); elbow = jh('lowerarm01' + s)
    foreDir = (wrist - elbow) / np.linalg.norm(wrist - elbow)
    along = (V - wrist) @ foreDir                            # 手首から先が正
    keepV = (tot > 0.5) & (along > -FORE_KEEP)
    Wt = Wt / np.maximum(tot[:, None], 1e-9)

    # 節の親子と関節の位置
    parent = {'fore': None, 'hand': None}          # 手首の曲げは前腕の側を回す（胴は手に付いて動かない）
    for f in range(1, 6):
        parent['f%d_1' % f] = 'hand'; parent['f%d_2' % f] = 'f%d_1' % f; parent['f%d_3' % f] = 'f%d_2' % f
    pivot = {'fore': wrist, 'hand': wrist}
    for f in range(1, 6):
        for j in (1, 2, 3): pivot['f%d_%d' % (f, j)] = jh('finger%d-%d%s' % (f, j, s))
    tipOf = {'f%d_3' % f: jt('finger%d-3%s' % (f, s)) for f in range(1, 6)}

    # 手の座標：a＝人差し指の付け根→小指の付け根、f＝手首→付け根の向き、n＝手のひらの向き
    K = [jh('finger%d-1%s' % (i, s)) for i in (2, 3, 4, 5)]
    km = np.mean(K, axis=0)
    a = K[0] - K[3]; a /= np.linalg.norm(a)
    fdir = km - wrist; fdir -= a*(fdir @ a); fdir /= np.linalg.norm(fdir)
    n = np.cross(fdir, a); n /= np.linalg.norm(n)
    # 手のひら側：力を抜いた手の親指の先は、手首と指の付け根を通る面の手のひら側にある
    if (jt('finger1-3' + s) - wrist) @ n < 0: n = -n
    # 手のひらの表面は、手の骨が主の頂点だけで測る（親指の付け根の肉を入れると胴が浮きすぎた）
    dom = np.argmax(Wt, axis=1)
    hv = np.where((dom == bones.index('hand')) & keepV)[0]
    palmSurf = np.percentile((V[hv] - km) @ n, 96)
    # 胴は指の付け根の関節のすぐ手のひら側に来る（関節の中心から胴の軸まで 胴の半径＋1.05cm）。
    # 手のひらの表面の外れ値から置くと、母指球・小指球の膨らみのぶん浮いて、指が 90 度しか巻けなかった
    C0 = km - fdir*0.004 + n*(R_BARREL + 0.0105)
    ax = a

    rot = {b: np.eye(3) for b in bones}
    def world():
        """節ごとの (R, t)：静止の位置 p を R(p - pivot) + pivot' へ"""
        M = {}
        for b in bones:
            Rl = rot[b]; p0 = pivot[b]
            if parent[b] is None: M[b] = (Rl, p0 - Rl @ p0)
            else:
                Rp, tp = M[parent[b]]
                # 親の変換の後で、自分の関節まわりに回す
                R = Rp @ Rl; pw = Rp @ p0 + tp; M[b] = (R, pw - R @ p0)
        return M
    def posed(M, idx):
        P = np.zeros((len(idx), 3))
        for bi, b in enumerate(bones):
            w = Wt[idx, bi]; m = w > 0
            if m.any(): R, t = M[b]; P[m] += w[m, None]*(V[idx][m] @ R.T + t)
        return P
    def dist_axis(P):
        q = P - C0; return np.linalg.norm(q - np.outer(q @ ax, ax), axis=1)

    # 手首を尺屈（手のひらの法線まわり）。前腕を逆に回して表す
    rot['fore'] = rodrigues(n, -ULNAR * (1 if SIDE == 'R' else -1))
    # 手首の掌屈・背屈（指の付け根の並びまわり）。前腕を画面の右下へ逃がす
    rot['fore'] = rodrigues(a, FLEX) @ rot['fore']

    # 指を節ごとに曲げ、皮膚が胴に触れたら止める。曲げる向きは、節の先が手のひら側（+n）へ動く側
    segV = {b: np.where((dom == bones.index(b)) & keepV)[0] for b in bones}
    for f in (2, 3, 4, 5):
        for j in (1, 2, 3):
            b = 'f%d_%d' % (f, j)
            nxt = pivot['f%d_%d' % (f, j+1)] if j < 3 else tipOf[b]
            rho = R_BARREL + (0.0085 if j < 3 else 0.0065)
            mid = (pivot[b] + nxt) / 2
            # 節の先の関節が胴の軸から rho の所に来る角を、両向きに探して小さいほうを取る。
            # 節の中ほどが胴に埋まる解は捨てる
            best = None
            for th in sorted(np.arange(-2.0, 2.0001, 0.01), key=abs):
                rot[b] = rodrigues(a, th); Mb = world()[b]
                e = Mb[0] @ nxt + Mb[1]; mdl = Mb[0] @ mid + Mb[1]
                if abs(dist_axis(e[None, :])[0] - rho) < 0.0012 and dist_axis(mdl[None, :])[0] > rho - 0.0025:
                    best = th; break
            if best is None: best = 0.0
            sgn = 1; ang = best
            rot[b] = rodrigues(a, best)
            print('節', b, round(float(sgn*ang), 2), file=sys.stderr)
    # 親指：胴の反対側へ回り込ませる。付け根を 2 軸、先の 2 節を曲げる組を粗く総当たりし、
    # 胴に埋まらず、先が胴の表面にいちばん近い組を取る
    tv = np.concatenate([segV['f1_1'], segV['f1_2'], segV['f1_3']])
    t3 = segV['f1_3']
    td = (pivot['f1_2'] - pivot['f1_1']); td /= np.linalg.norm(td)
    tax = np.cross(n, td); tax /= np.linalg.norm(tax)
    bestS = (1e9, None)
    for al in np.linspace(-1.4, 1.4, 15):
        for be in np.linspace(-1.2, 1.2, 13):
            R1 = rodrigues(fdir, al) @ rodrigues(a, be)
            for ga in np.linspace(0, 1.3, 7):
                rot['f1_1'] = R1; rot['f1_2'] = rodrigues(tax, ga); rot['f1_3'] = rodrigues(tax, ga*0.8)
                P = posed(world(), tv); d = dist_axis(P)
                pen = np.maximum(0, R_BARREL + 0.0006 - d).sum()
                d3 = dist_axis(posed(world(), t3))
                score = pen*400 + abs(d3.min() - R_BARREL - 0.001)*10 + abs(al)*0.002
                if score < bestS[0]: bestS = (score, (al, be, ga))
    al, be, ga = bestS[1]
    rot['f1_1'] = rodrigues(fdir, al) @ rodrigues(a, be); rot['f1_2'] = rodrigues(tax, ga); rot['f1_3'] = rodrigues(tax, ga*0.8)
    print('親指', [round(float(x), 2) for x in bestS[1]], round(float(bestS[0]), 4), file=sys.stderr)

    M = world()
    for f in (2, 3, 4, 5):
        row = []
        for j in (1, 2, 3):
            b = 'f%d_%d' % (f, j); Mb = M[b]
            row.append(round(float(dist_axis((Mb[0] @ pivot[b] + Mb[1])[None, :])[0]), 4))
        Mb = M['f%d_3' % f]; row.append(round(float(dist_axis((Mb[0] @ tipOf['f%d_3' % f] + Mb[1])[None, :])[0]), 4))
        if os.environ.get('HDBG'): print('指', f, row, file=sys.stderr)
    keep = np.where(keepV)[0]
    P = posed(M, np.arange(nv))
    # 胴の座標へ：Z＝胴の軸（小指→人差し指が -Z：ランプの頭の側へ人差し指）、-Y＝手のひら→胴の中心の向き
    z = -ax
    # 胴の軸のうち、手のひらの中心に最も近い点を原点に
    palmC = P[hv].mean(axis=0)
    o = C0 + ax*((palmC - C0) @ ax)
    yv = palmC - o; yv -= z*(yv @ z); yv /= np.linalg.norm(yv)      # 胴の中心→手のひら が +Y
    x = np.cross(yv, z)
    B = np.stack([x, yv, z])
    def toB(Q): return (Q - o) @ B.T
    Pb = toB(P)

    # 面：体の面のうち、残す頂点だけで閉じるもの
    faces = [f for f, g in zip(F, G) if g == 'body' and all(keepV[vi] for vi, _ in f)]
    def mesh(fs, off=None):
        key = {}; pos = []; uv = []; tris = []
        for f in fs:
            ids = []
            for vi, ti in f:
                k2 = (vi, ti)
                if k2 not in key: key[k2] = len(pos); pos.append(Pb[vi] + (off[vi] if off is not None else 0)); uv.append(VT[ti])
                ids.append(key[k2])
            for jj in range(1, len(ids) - 1): tris.append([ids[0], ids[jj], ids[jj+1]])
        pos = np.array(pos); tris = np.array(tris, dtype=np.int64); uv = np.array(uv)
        fn = np.cross(pos[tris[:, 1]] - pos[tris[:, 0]], pos[tris[:, 2]] - pos[tris[:, 0]])
        nr = np.zeros_like(pos)
        for c in range(3): np.add.at(nr, tris[:, c], fn)
        q = np.round(pos*20000).astype(np.int64)
        _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
        acc = np.zeros((inv.max() + 1, 3)); np.add.at(acc, inv, nr); nr = acc[inv]
        nr /= np.maximum(np.linalg.norm(nr, axis=1, keepdims=True), 1e-9)
        return dict(p=pos, uv=uv, n=nr, t=tris)
    skinM = mesh(faces)
    # 頂点法線（浮かせる向き）
    vn = np.zeros_like(Pb)
    for f in faces:
        ids = [vi for vi, _ in f]
        for jj in range(1, len(ids) - 1):
            fn = np.cross(Pb[ids[jj]] - Pb[ids[0]], Pb[ids[jj+1]] - Pb[ids[0]])
            for q in (ids[0], ids[jj], ids[jj+1]): vn[q] += fn
    vn /= np.maximum(np.linalg.norm(vn, axis=1, keepdims=True), 1e-9)
    alongW = (V - wrist) @ foreDir
    def band(sel, lift):
        fs = [f for f in faces if all(sel[vi] for vi, _ in f)]
        return mesh(fs, vn*lift)
    ih = bones.index('hand')
    # 包帯：手のひら〜甲の中ほど（手首から 2〜5.5cm）を 2.2mm 浮かせて一周
    gauze = band((Wt[:, ih] > 0.55) & (alongW > 0.02) & (alongW < 0.055), 0.0022)
    # 患者用バンド：手首から肘側へ 2.5〜4.5cm の前腕を 1.8mm 浮かせて一周
    wbnd = band((alongW < -0.020) & (alongW > -0.060) & (Wt[:, bones.index('fore')] > 0.5), 0.0018)
    # 爪：各指の先の節の、手の甲側の面（法線が手の甲を向く）を 0.5mm 浮かせる
    dorsal = np.zeros(nv, bool)
    for f in range(1, 6):
        b = bones.index('f%d_3' % f)
        tipB = toB((M['f%d_3' % f][0] @ tipOf['f%d_3' % f] + M['f%d_3' % f][1])[None, :])[0]
        m = (Wt[:, b] > 0.9) & (np.linalg.norm(Pb - tipB, axis=1) < 0.013)
        # 指先の節の向き（関節→先）に垂直で、手の甲へ向いている面
        pj = toB((M['f%d_3' % f][0] @ pivot['f%d_3' % f] + M['f%d_3' % f][1])[None, :])[0]
        dd = (tipB - pj) / np.linalg.norm(tipB - pj)
        cen = (pj + tipB) / 2
        outw = Pb - cen; outw -= np.outer(outw @ dd, dd)
        dorsalDir = -np.cross(dd, np.array([0, 0, 1.0]))                 # 大まかな手の甲の向き
        m &= ((vn * 1) @ (outw.mean(axis=0) * 0 + 1) != 0)
        dorsal |= m & ((vn @ dorsalDir) > 0.35) if f != 1 else m & ((vn @ np.array([0, 1.0, 0])) > 0.2)
    nails = band(dorsal, 0.0005)
    parts = [('skin', skinM), ('gauze', gauze), ('band', wbnd), ('nail', nails)]
    for nm, m in parts: print(nm, len(m['p']), '頂点', len(m['t']), '三角形', file=sys.stderr)
    dmin = dist_axis(P[keep]).min()
    print('胴の軸からの最短距離', round(float(dmin), 4), '（胴の半径', R_BARREL, '）', file=sys.stderr)

    allP = np.concatenate([m['p'] for _, m in parts]); allU = np.concatenate([m['uv'] for _, m in parts])
    box = [allP.min(axis=0), allP.max(axis=0)]; ub = [allU.min(axis=0), allU.max(axis=0)]
    blob = bytearray(); meta = {'box': [box[0].tolist(), box[1].tolist()], 'uv': [ub[0].tolist(), ub[1].tolist()],
                               'barrel': R_BARREL, 'parts': []}
    def pad4():
        while len(blob) % 4: blob.append(0)
    for nm, m in parts:
        ent = {'name': nm, 'v': len(m['p']), 'i': int(m['t'].size), 'off': []}
        ent['off'].append(len(blob)); blob += np.round((m['p'] - box[0]) / (box[1] - box[0]) * 65534 - 32767).astype('<i2').tobytes(); pad4()
        ent['off'].append(len(blob)); blob += np.round(m['n']*127).astype('i1').tobytes(); pad4()
        ent['off'].append(len(blob)); blob += np.round((m['uv'] - ub[0]) / (ub[1] - ub[0]) * 65534 - 32767).astype('<i2').tobytes(); pad4()
        ent['off'].append(len(blob)); blob += m['t'].astype('<u2').tobytes(); pad4()
        meta['parts'].append(ent)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'mesh.bin'), 'wb').write(bytes(blob))
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'))
    print('書いた', len(blob), 'バイト', file=sys.stderr)

if __name__ == '__main__':
    main()

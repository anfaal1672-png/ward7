"""追跡者の人体（設計指示書 第 9.1 節「市販または CC0 の人体モデルを土台に、痩せ・関節・病衣を加工して作る」）。

MakeHuman（CC0。基本の体・形の差分・既定の骨格と重み）を取り寄せ、
  1. 形の差分を掛けて、年寄りで痩せて筋肉の落ちた背の高い男にする
  2. 163 本の骨の重みを、追跡者の既存の関節（buildHunter の Group）20 本へ畳む
     （指は付け根と先の 2 段だけ残す。骨 40 本以内：第 9.1 節）
  3. 体の各部を追跡者の骨格の寸法へ引き伸ばす（胴と腕が長い。関節の位置は buildHunter の値）
  4. 病衣：胴と腰から膝上までの面を体から浮かせて写し、裾は補助の筒（helper-skirt）を膝上で切る
  5. 三角形 2 万 / 8 千 / 2 千の 3 段に減らす（病衣は 6 千 / 2400 / 700）
  6. 位置・UV 16bit、法線 8bit、骨の番号と重み 8bit×4 で assets/models/hunter/ に書く
原本はリポジトリに置かない。出所は assets/LICENSES.md。
要るもの: python3・numpy・fast-simplification（pip install numpy fast-simplification）
使い方: python3 .tools/human-bake.py
buildHunter の関節の位置を変えたら、下の HUNTER を合わせて焼き直すこと。"""
import json, os, struct, subprocess, sys
import numpy as np
import fast_simplification

REV = 'a8bc2d54ff0ac92e78ff71431b1023eda42bf482'
RAW = 'https://raw.githubusercontent.com/makehumancommunity/makehuman/' + REV + '/makehuman/data/'
CACHE = os.environ.get('ASSET_CACHE', '/tmp/ward7-asset-cache') + '/makehuman'
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'models', 'hunter')

def get(rel):
    p = os.path.join(CACHE, rel)
    if not os.path.exists(p):
        os.makedirs(os.path.dirname(p), exist_ok=True)
        subprocess.check_call(['curl', '-sSLf', '-o', p, RAW + rel])
    return p

# ---- 形の差分（MakeHuman のマクロと同じ掛け方：性別×年齢×筋肉×体重の組の重み） ----
AGE_OLD = 0.65          # 年齢のつまみ 0.5=25 歳 / 1.0=90 歳 → 0.825 ≈ 67 歳
SHAPE = [
    ('macrodetails/universal-male-young-minmuscle-minweight.target', 1 - AGE_OLD),
    ('macrodetails/universal-male-old-minmuscle-minweight.target',   AGE_OLD),
    ('macrodetails/asian-male-young.target', 1 - AGE_OLD),
    ('macrodetails/asian-male-old.target',   AGE_OLD),
    ('macrodetails/height/male-young-minmuscle-minweight-maxheight.target', 0.6*(1 - AGE_OLD)),
    ('macrodetails/height/male-old-minmuscle-minweight-maxheight.target',   0.6*AGE_OLD),
    # さらに痩せさせる。肋の上に皮しか無い胴、筋の落ちた手足
    ('torso/torso-scale-depth-decr.target', 0.5),
    ('torso/torso-scale-horiz-decr.target', 0.35),
    ('torso/torso-muscle-pectoral-decr.target', 0.8),
] + [('armslegs/%s-%s-%s-decr.target' % (s, part, k), w)
     for s in ('l', 'r') for part in ('upperarm', 'lowerarm', 'upperleg', 'lowerleg')
     for k, w in (('fat', 1.0), ('muscle', 1.0))]

def load_obj():
    V, VT, F, G = [], [], [], []
    g = None
    for l in open(get('3dobjs/base.obj')):
        if l.startswith('v '): V.append([float(x) for x in l.split()[1:4]])
        elif l.startswith('vt '): VT.append([float(x) for x in l.split()[1:3]])
        elif l.startswith('g '): g = l.split()[1]
        elif l.startswith('f '):
            F.append([tuple(int(t) - 1 for t in c.split('/')[:2]) for c in l.split()[1:]]); G.append(g)
    return np.array(V), np.array(VT), F, G

def apply_targets(V):
    V = V.copy()
    for rel, w in SHAPE:
        if w == 0: continue
        for l in open(get('targets/' + rel)):
            if not l.strip() or l.startswith('#'): continue
            i, x, y, z = l.split(); V[int(i)] += w * np.array([float(x), float(y), float(z)])
    return V

# ---- 追跡者の骨（buildHunter の値。g の原点＝床、+Z が前、+X が体の左） ----
SPINE_Y = 0.02 + 0.50 + 0.57
HUNTER = {
    'spine': (0, SPINE_Y, 0),
    'neck':  (0, SPINE_Y + 0.90, 0),
    'head':  (0, SPINE_Y + 0.90 + 0.26, 0),
}
for s, nm in ((1, 'R'), (-1, 'L')):          # 追跡者の armL は x<0 側（arm(-1)）
    HUNTER['up' + nm]    = (s*0.27, SPINE_Y + 0.90, 0)
    HUNTER['fore' + nm]  = (s*0.27, SPINE_Y + 0.90 - 0.58, 0)
    HUNTER['hand' + nm]  = (s*0.27, SPINE_Y + 0.90 - 0.58 - 0.66, 0)
    HUNTER['handE' + nm] = (s*0.27, SPINE_Y + 0.90 - 0.58 - 0.66 - 0.19, 0)
    HUNTER['thigh' + nm] = (s*0.12, SPINE_Y + 0.02, 0)
    HUNTER['shin' + nm]  = (s*0.12, SPINE_Y + 0.02 - 0.50, 0)
    HUNTER['foot' + nm]  = (s*0.12, SPINE_Y + 0.02 - 0.50 - 0.54, 0.04)
BONES = ['spine', 'neck', 'head', 'jaw',
         'upL', 'foreL', 'handL', 'fingPL', 'fingDL', 'upR', 'foreR', 'handR', 'fingPR', 'fingDR',
         'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR']
K = 1.18                 # 太さ（骨に垂直な向き）の倍率。背丈 2.4m の体に合わせて少し太らせる
K_HEAD = 1.10            # 頭は体ほど大きくしない（小さい頭は不気味）

def target_of(b, sk):
    """MakeHuman の骨 → 追跡者の骨"""
    side = '' if not b.endswith(('.L', '.R')) else ('R' if b.endswith('.L') else 'L')   # MH の .L は +X
    n = b.split('.')[0]
    chain = []
    x = b
    while x: chain.append(x.split('.')[0]); x = sk[x]['parent']
    if 'jaw' in chain: return 'jaw'
    if 'head' in chain: return 'head'
    if n.startswith('neck'): return 'neck'
    if n.startswith('upperarm'): return 'up' + side
    if n.startswith('lowerarm'): return 'fore' + side
    if n.startswith('finger') and not n.startswith('finger1'):
        return ('fingP' if n.endswith('-1') else 'fingD') + side
    if n.startswith(('wrist', 'metacarpal', 'finger1')): return 'hand' + side
    if n.startswith('upperleg'): return 'thigh' + side
    if n.startswith('lowerleg'): return 'shin' + side
    if n.startswith(('foot', 'toe')): return 'foot' + side
    return 'spine'

def rot_between(a, b):
    a = a / np.linalg.norm(a); b = b / np.linalg.norm(b)
    v = np.cross(a, b); c = float(np.dot(a, b))
    if np.linalg.norm(v) < 1e-9: return np.eye(3)
    vx = np.array([[0, -v[2], v[1]], [v[2], 0, -v[0]], [-v[1], v[0], 0]])
    return np.eye(3) + vx + vx @ vx * (1 / (1 + c))

def seg_map(A, B, A2, B2, k):
    """線分 AB を A2B2 へ。骨の向きへは長さの比、垂直には k 倍"""
    d = B - A; L = np.linalg.norm(d); u = d / L
    s = np.linalg.norm(B2 - A2) / L
    R = rot_between(d, B2 - A2)
    def f(P):
        q = P - A; al = q @ u
        return A2 + (np.outer(al * s, u) + (q - np.outer(al, u)) * k) @ R.T
    return f

def main():
    V0, VT, F, G = load_obj()
    V = apply_targets(V0) * 0.1                                     # dm → m
    sk = json.load(open(get('rigs/default.mhskel')))
    J = {n: V[idx].mean(axis=0) for n, idx in sk['joints'].items()}
    def jh(b): return J[sk['bones'][b]['head']]
    def jt(b): return J[sk['bones'][b]['tail']]
    W = json.load(open(get('rigs/default_weights.mhw')))['weights']

    # 骨ごとの重みを追跡者の骨へ畳む
    nv = len(V); Wt = np.zeros((nv, len(BONES)))
    for b, lst in W.items():
        t = BONES.index(target_of(b, sk['bones']))
        for vi, w in lst: Wt[vi, t] += w
    Wt /= np.maximum(Wt.sum(axis=1, keepdims=True), 1e-9)

    # 部位ごとの写し方
    maps = {}
    H = {k: np.array(v, float) for k, v in HUNTER.items()}
    hipMH = (jh('upperleg01.L') + jh('upperleg01.R')) / 2
    shMH = (jh('upperarm01.L') + jh('upperarm01.R')) / 2
    hipW = jh('upperleg01.L')[0]; shW = jh('upperarm01.L')[0]
    def torso(P):
        t = (P[:, 1] - hipMH[1]) / (shMH[1] - hipMH[1])
        tc = np.clip(t, 0, 1)
        sx = (0.12 / hipW) * (1 - tc) + (0.27 / shW) * tc
        sx = np.minimum(sx, 1.5) * 0.92 + 0.08 * K
        out = np.empty_like(P)
        out[:, 0] = P[:, 0] * sx
        out[:, 1] = H['thighL'][1] + t * (H['upL'][1] - H['thighL'][1])
        out[:, 2] = (P[:, 2] - hipMH[2]) * K
        return out
    maps['spine'] = torso
    maps['neck'] = seg_map(jh('neck01'), jh('head'), H['neck'] + np.array([0, -0.02, 0]), H['head'], K)
    # 頭は向きを変えず、首の付け根の位置を合わせて K_HEAD 倍するだけ
    hd0 = jh('head')
    maps['head'] = lambda P: H['head'] + (P - hd0) * K_HEAD
    maps['jaw'] = maps['head']
    for mh, hs in (('L', 'R'), ('R', 'L')):
        maps['up' + hs] = seg_map(jh('upperarm01.' + mh), jh('lowerarm01.' + mh), H['up' + hs], H['fore' + hs], K)
        maps['fore' + hs] = seg_map(jh('lowerarm01.' + mh), jh('wrist.' + mh), H['fore' + hs], H['hand' + hs], K)
        tipMH = jt('finger3-3.' + mh)
        maps['hand' + hs] = seg_map(jh('wrist.' + mh), tipMH, H['hand' + hs], H['handE' + hs], K)
        maps['fingP' + hs] = maps['hand' + hs]; maps['fingD' + hs] = maps['hand' + hs]
        maps['thigh' + hs] = seg_map(jh('upperleg01.' + mh), jh('lowerleg01.' + mh), H['thigh' + hs], H['shin' + hs], K)
        maps['shin' + hs] = seg_map(jh('lowerleg01.' + mh), jh('foot.' + mh), H['shin' + hs], H['foot' + hs], K)
        # 足は向きを保ったまま、足首の位置へ運ぶ。足首の高さが追跡者の足首（床から 7cm）に
        # 合うよう縦だけ縮める（そのままだと足の裏が床へ 3cm 沈む）
        a0 = jh('foot.' + mh)
        fv = np.array(sorted(vi for vi, w in W['foot.' + mh] if w > 0.5))
        kY = (H['foot' + hs][1] - 0.004) / (a0[1] - V[fv, 1].min())
        maps['foot' + hs] = (lambda a0, hs, kY: lambda P: H['foot' + hs] + (P - a0) * np.array([K, kY, K]))(a0, hs, kY)

    # 写す（重みで混ぜる）
    P2 = np.zeros_like(V)
    for bi, b in enumerate(BONES):
        m = Wt[:, bi] > 0
        if m.any(): P2[m] += Wt[m, bi:bi+1] * maps[b](V[m])
    body = np.unique([vi for f, g in zip(F, G) if g == 'body' for vi, _ in f])
    print('足の裏の高さ', P2[body, 1].min(), file=sys.stderr)

    # 目・顎・指の関節（実行時に Group を置く位置）
    def mp(b, P):
        return maps[b](P[None, :])[0]
    joints = {
        'eyeL': mp('head', J[sk['bones']['eye.R']['head']]).tolist(),   # 追跡者の L は -X
        'eyeR': mp('head', J[sk['bones']['eye.L']['head']]).tolist(),
        'jaw': mp('head', jh('jaw')).tolist(),
        'mouth': mp('head', (jh('oris01') + jh('oris05')) / 2).tolist(),
    }
    for mh, hs in (('L', 'R'), ('R', 'L')):
        kn = np.mean([jh('finger%d-1.%s' % (f, mh)) for f in (2, 3, 4, 5)], axis=0)
        md = np.mean([jh('finger%d-2.%s' % (f, mh)) for f in (2, 3, 4, 5)], axis=0)
        # 曲げの軸：指の向き × 手のひらの法線（人差し指側→小指側 と 指の向き から）
        across = jh('finger2-1.' + mh) - jh('finger5-1.' + mh)
        along = jh('finger3-2.' + mh) - jh('finger3-1.' + mh)
        knH, mdH = mp('hand' + hs, kn), mp('hand' + hs, md)
        f = maps['hand' + hs]
        a2 = f(np.array([kn + across])) - f(np.array([kn]))
        l2 = f(np.array([kn + along])) - f(np.array([kn]))
        palm = np.cross(a2[0], l2[0]); palm /= np.linalg.norm(palm)
        axis = np.cross(l2[0] / np.linalg.norm(l2[0]), palm); axis /= np.linalg.norm(axis)
        joints['fingP' + hs] = knH.tolist(); joints['fingD' + hs] = mdH.tolist()
        joints['curl' + hs] = axis.tolist()

    # 面を集める。四角を三角へ、位置と UV の組で頂点を分ける。位置は引き伸ばす前（MakeHuman の寸法）のまま。
    # 引き伸ばした後で減らすと、2.5 倍に伸ばした前腕などで縦に細長い三角形ばかり残る
    def mapto(Pm, Wm):
        out = np.zeros_like(Pm)
        for bi, b in enumerate(BONES):
            m = Wm[:, bi] > 0
            if m.any(): out[m] += Wm[m, bi:bi+1] * maps[b](Pm[m])
        return out
    def gather(keep):
        key = {}; pos = []; uv = []; wts = []; tris = []
        for f, g in zip(F, G):
            if not keep(f, g): continue
            ids = []
            for vi, ti in f:
                k2 = (vi, ti)
                if k2 not in key:
                    key[k2] = len(pos); pos.append(V[vi]); uv.append(VT[ti]); wts.append(Wt[vi])
                ids.append(key[k2])
            for j in range(1, len(ids) - 1): tris.append([ids[0], ids[j], ids[j+1]])
        return np.array(pos), np.array(uv), np.array(wts), np.array(tris, dtype=np.int64)

    def reduce(pos, uv, wts, tris, wants, name, lift=0.0):
        print(name, len(pos), '頂点', len(tris), '三角形', file=sys.stderr)
        lods = []
        for want in wants:
            red = 1 - want / len(tris)
            if red <= 0:
                p, t, mapping = pos, tris, np.arange(len(pos))
            else:
                _, _, coll = fast_simplification.simplify(pos, tris, target_reduction=red, return_collapses=True)
                p, t, mapping = fast_simplification.replay_simplification(pos, tris, coll)
            n = len(p)
            cnt = np.bincount(mapping, minlength=n).astype(float)[:, None]
            u2 = np.zeros((n, 2)); np.add.at(u2, mapping, uv); u2 /= np.maximum(cnt, 1)
            w2 = np.zeros((n, len(BONES))); np.add.at(w2, mapping, wts); w2 /= np.maximum(cnt, 1)
            # 使われない頂点を落とす
            used = np.unique(t); remap = -np.ones(n, dtype=np.int64); remap[used] = np.arange(len(used))
            p, u2, w2, t = p[used], u2[used], w2[used], remap[t]
            p = mapto(p, w2 / np.maximum(w2.sum(axis=1, keepdims=True), 1e-9))
            # 法線：面積で重み、同じ位置（UV の継ぎ目）の頂点どうしで揃える
            fn = np.cross(p[t[:, 1]] - p[t[:, 0]], p[t[:, 2]] - p[t[:, 0]])
            nr = np.zeros_like(p)
            for c in range(3): np.add.at(nr, t[:, c], fn)
            q = np.round(p * 2000).astype(np.int64)
            _, inv = np.unique(q, axis=0, return_inverse=True); inv = inv.reshape(-1)
            acc = np.zeros((inv.max() + 1, 3)); np.add.at(acc, inv, nr); nr = acc[inv]
            nr /= np.maximum(np.linalg.norm(nr, axis=1, keepdims=True), 1e-9)
            p = p + nr * lift                      # 病衣は体から浮かせる
            # 重みは上位 4 本、8bit
            top = np.argsort(-w2, axis=1)[:, :4]
            tw = np.take_along_axis(w2, top, axis=1); tw /= np.maximum(tw.sum(axis=1, keepdims=True), 1e-9)
            tw8 = np.round(tw * 255).astype(np.int64)
            tw8[:, 0] += 255 - tw8.sum(axis=1)
            lods.append(dict(p=p, uv=u2, n=nr, t=t, bi=top, bw=tw8))
            print('  段', len(lods), len(p), '頂点', len(t), '三角形', file=sys.stderr)
        return lods

    lods = reduce(*gather(lambda f, g: g == 'body'), (20000, 8000, 2000), '体')

    # 病衣。胴（肩口の袖まで）と腰から膝上までを、体の面から 1.4cm 浮かせて写す。
    # 裾は MakeHuman の補助の筒（helper-skirt）を膝の上で切って使う
    iS, iUpL, iUpR = BONES.index('spine'), BONES.index('upL'), BONES.index('upR')
    kneeY = H['shinL'][1] + 0.10; neckY = H['neck'][1] - 0.02
    def gownFace(f, g):
        ids = [vi for vi, _ in f]; c = P2[ids].mean(axis=0)
        if g == 'helper-skirt': return P2[ids, 1].min() > kneeY
        if g != 'body' or c[1] > neckY or c[1] < kneeY: return False
        w = Wt[ids].mean(axis=0)
        if w[iS] > 0.5: return True
        if max(w[iUpL], w[iUpR]) > 0.3 and c[1] > H['upL'][1] - 0.20: return True      # 短い袖
        return False
    gown = reduce(*gather(gownFace), (6000, 2400, 700), '病衣', lift=0.014)
    allL = lods + gown
    box = [np.min([l['p'].min(axis=0) for l in allL], axis=0), np.max([l['p'].max(axis=0) for l in allL], axis=0)]
    ubox = [np.min([l['uv'].min(axis=0) for l in allL], axis=0), np.max([l['uv'].max(axis=0) for l in allL], axis=0)]
    blob = bytearray(); meta = {'bones': BONES, 'box': [box[0].tolist(), box[1].tolist()],
                               'uv': [ubox[0].tolist(), ubox[1].tolist()], 'joints': joints, 'lods': [], 'gown': []}
    def pad4():
        while len(blob) % 4: blob.append(0)
    for l in allL:
        v = len(l['p']); ent = {'v': v, 'i': int(l['t'].size), 'off': []}
        qp = np.round((l['p'] - box[0]) / (box[1] - box[0]) * 65534 - 32767).astype('<i2')
        ent['off'].append(len(blob)); blob += qp.tobytes(); pad4()
        ent['off'].append(len(blob)); blob += np.round(l['n'] * 127).astype('i1').tobytes(); pad4()
        qu = np.round((l['uv'] - ubox[0]) / (ubox[1] - ubox[0]) * 65534 - 32767).astype('<i2')
        ent['off'].append(len(blob)); blob += qu.tobytes(); pad4()
        ent['off'].append(len(blob)); blob += l['bi'].astype('u1').tobytes(); pad4()
        ent['off'].append(len(blob)); blob += l['bw'].astype('u1').tobytes(); pad4()
        ent['off'].append(len(blob)); blob += l['t'].astype('<u2').tobytes(); pad4()
        meta['lods' if len(meta['lods']) < len(lods) else 'gown'].append(ent)
    os.makedirs(OUT, exist_ok=True)
    open(os.path.join(OUT, 'mesh.bin'), 'wb').write(bytes(blob))
    json.dump(meta, open(os.path.join(OUT, 'meta.json'), 'w'), separators=(',', ':'))
    print('書いた', len(blob), 'バイト', file=sys.stderr)

if __name__ == '__main__':
    main()

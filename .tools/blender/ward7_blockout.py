"""ブロックアウト（設計指示書 第 6.4 節）。章の病棟（level-dump.js の書き出し）を Blender に組み、
手で置く印（音響領域・演出トリガー・巡回点・光源）を空の物（Empty）として並べる。

座標：ゲームの世界の (x, z) を Blender の (x, -z) に置く（Blender は Z が上）。glTF に書き出すと
Blender の (x, y, z) は (x, z, -y) になるので、ゲームの (x, 高さ, z) にそのまま戻る。

印の決まり（Empty のカスタムプロパティ。書き出しで glTF の extras になる）:
  ward7 = 'sound' | 'trigger' | 'patrol' | 'light'
  r（半径 m）, space（'box'|'room'|'hall'）, act（'stinger'|'creak'|'whisper'|'clang'|'toast'）,
  text（toast の文）, once（0 で出入りのたびに鳴る）, i（光の強さ）, flicker（1 で明滅）, color（'#rrggbb'）
壁・床・部屋・隠れ場所は参照用（ward7_ref=1）。書き出しには含めない。

使い方:
  blender -b --python .tools/blender/ward7_blockout.py -- <ward_chN.json> <出力 .blend> [既存の chN.json] [--demo]
  --demo は見本の印を数個置く（道具の動作確認用）"""
import bpy, bmesh, json, sys, math

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
flags = [a for a in argv if a.startswith('--')]; argv = [a for a in argv if not a.startswith('--')]
ward = json.load(open(argv[0])); out = argv[1]
level = json.load(open(argv[2])) if len(argv) > 2 else {'items': []}

bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
CELL, GW, GH = ward['cell'], ward['gw'], ward['gh']
def cell_to_world(cx, cy): return ((cx - (GW - 1) / 2) * CELL, (cy - (GH - 1) / 2) * CELL)
def to_bl(x, z, h=0.0): return (x, -z, h)

def ref_col(name):
    c = bpy.data.collections.new(name); scn.collection.children.link(c); return c
cRef = ref_col('ward_ref'); cMk = ref_col('ward7_markers')

def mat(name, rgba):
    m = bpy.data.materials.new(name); m.diffuse_color = rgba; return m

# 壁：壁のマスを 1 つのメッシュに
bm = bmesh.new()
H = 3.0
for cy in range(GH):
    for cx in range(GW):
        if ward['grid'][cy * GW + cx] == 0: continue
        x, z = cell_to_world(cx, cy)
        r = bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=(CELL, CELL, H), verts=r['verts'])
        bmesh.ops.translate(bm, vec=(x, -z, H / 2), verts=r['verts'])
me = bpy.data.meshes.new('ward_walls'); bm.to_mesh(me); bm.free()
walls = bpy.data.objects.new('ward_walls', me); walls['ward7_ref'] = 1
walls.data.materials.append(mat('wall', (0.55, 0.62, 0.58, 1))); cRef.objects.link(walls)
# 床
half = (GW * CELL) / 2
bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=half)
me = bpy.data.meshes.new('ward_floor'); bm.to_mesh(me); bm.free()
floor = bpy.data.objects.new('ward_floor', me); floor['ward7_ref'] = 1
floor.data.materials.append(mat('floor', (0.3, 0.28, 0.22, 1))); cRef.objects.link(floor)
# 部屋・隠れ場所・開始地点（参照）
for i, rm in enumerate(ward['rooms']):
    x0, z0 = cell_to_world(rm['x'], rm['y']); x1, z1 = cell_to_world(rm['x'] + rm['w'] - 1, rm['y'] + rm['h'] - 1)
    e = bpy.data.objects.new('room_%02d' % i, None); e.empty_display_type = 'CUBE'
    e.location = to_bl((x0 + x1) / 2, (z0 + z1) / 2, 0.05)
    e.scale = ((x1 - x0 + CELL) / 2, (z1 - z0 + CELL) / 2, 0.05); e['ward7_ref'] = 1; cRef.objects.link(e)
hideMat = mat('hide', (0.8, 0.5, 0.2, 1))
for i, hd in enumerate(ward['hides']):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    me = bpy.data.meshes.new('hide_%02d' % i); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('hide_%02d_%s' % (i, hd['type']), me); o.data.materials.append(hideMat)
    o.location = to_bl(hd['x'], hd['z'], 0.9); o.scale = (0.3, 0.3, 0.9); o['ward7_ref'] = 1; cRef.objects.link(o)
st = bpy.data.objects.new('start', None); st.empty_display_type = 'SINGLE_ARROW'
st.location = to_bl(ward['start']['x'], ward['start']['z'], 0); st['ward7_ref'] = 1; cRef.objects.link(st)

# 印
SHAPE = {'sound': 'SPHERE', 'trigger': 'CIRCLE', 'patrol': 'PLAIN_AXES', 'light': 'CONE'}
def marker(i, it):
    e = bpy.data.objects.new('%s_%02d' % (it['kind'], i), None)
    e.empty_display_type = SHAPE.get(it['kind'], 'PLAIN_AXES')
    e.empty_display_size = it.get('r', 1.0) if it['kind'] in ('sound', 'trigger') else 0.5
    e.location = to_bl(it['x'], it['z'], it.get('y', 0.0))
    e['ward7'] = it['kind']
    for k in ('r', 'space', 'act', 'text', 'i'):
        if k in it: e[k] = it[k]
    if 'once' in it: e['once'] = 1 if it['once'] else 0
    if 'flicker' in it: e['flicker'] = 1 if it['flicker'] else 0
    if 'color' in it: e['color'] = '#%06x' % it['color']
    cMk.objects.link(e)
items = list(level.get('items', []))
if '--demo' in flags:
    sx, sz = ward['start']['x'], ward['start']['z']
    items += [{'kind': 'trigger', 'x': sx + 6, 'z': sz, 'r': 2, 'act': 'creak'},
              {'kind': 'sound', 'x': sx, 'z': sz, 'r': 4, 'space': 'hall'},
              {'kind': 'light', 'x': sx + 3, 'z': sz, 'y': 2.4, 'i': 0.8, 'flicker': True}]
for i, it in enumerate(items): marker(i, it)
bpy.ops.wm.save_as_mainfile(filepath=out)
print('書いた', out, '壁', len(walls.data.polygons) // 6, '印', len(items))

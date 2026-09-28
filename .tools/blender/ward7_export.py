"""書き出し（設計指示書 第 6.4 節）。ward7 のカスタムプロパティを持つ空の物だけを glTF（.glb）に書く。
カスタムプロパティは glTF の extras になり、.tools/level-import.js がゲームの上書き（game/src/levels/chN.json）に直す。
使い方: blender -b <ブロックアウト .blend> --python .tools/blender/ward7_export.py -- <出力 .glb>"""
import bpy, sys
out = sys.argv[sys.argv.index('--') + 1]
for o in bpy.data.objects: o.select_set(False)
n = 0
for o in bpy.context.scene.objects:
    if 'ward7' in o.keys():
        o.select_set(True); n += 1
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_extras=True,
                          export_yup=True, export_apply=False)
print('書き出した', out, '印', n)

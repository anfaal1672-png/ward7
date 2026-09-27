import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# mergeBoxes を一般化して、箱・円錐台・球を混ぜられるようにする
rep("""  function mergeBoxes(specs){
    var pos = [], nor = [], uvs = [];
    for(var i=0;i<specs.length;i++){
      var sp = specs[i];
      var bg = new THREE.BoxGeometry(sp.w, sp.h, sp.d);""",
"""  /* 部品を 1 つのジオメトリに畳む。
     もとは箱しか置けなかったので、体のどこを見ても角が立っていた。
     円錐台（先細りの筒）と球を混ぜられるようにして、
     骨と関節の形をそのまま出せるようにする。
       type 省略      … 箱（w,h,d）
       type:'cyl'     … 円錐台（rt=上半径, rb=下半径, h=長さ）
       type:'sph'     … 球（r、sy で縦につぶす）
     分割数は品質で変える。低い端末では今までどおり粗いまま。 */
  var SEG = QC.detail ? 10 : 6;
  function mergeBoxes(specs){
    var pos = [], nor = [], uvs = [];
    for(var i=0;i<specs.length;i++){
      var sp = specs[i];
      var bg;
      if(sp.type === 'cyl'){
        bg = new THREE.CylinderGeometry(sp.rt, sp.rb, sp.h, SEG, 1, true);
      }else if(sp.type === 'sph'){
        bg = new THREE.SphereGeometry(sp.r, SEG, Math.max(4, SEG>>1));
        if(sp.sy || sp.sx || sp.sz) bg.scale(sp.sx||1, sp.sy||1, sp.sz||1);
      }else{
        bg = new THREE.BoxGeometry(sp.w, sp.h, sp.d);
      }""", 'merge')

# 骨は先細りの筒＋関節の球にする
rep("""  function boneDown(w, len, d, mat){
    var geo = new THREE.BoxGeometry(w, len, d);
    geo.translate(0, -len/2, 0);
    return new THREE.Mesh(geo, mat || skin);
  }
  function boneUp(w, len, d, mat){
    var geo = new THREE.BoxGeometry(w, len, d);
    geo.translate(0, len/2, 0);
    return new THREE.Mesh(geo, mat || skin);
  }""",
"""  /* 手足の骨。角柱ではなく、上が太く下が細い筒にする。
     付け根に球を置くと、曲げたときに関節の穴が開かない——
     箱を並べていたときは、肘や膝を深く曲げるたびに隙間が見えていた。 */
  function boneDown(w, len, d, mat){
    var r = w * 0.5;
    return new THREE.Mesh(mergeBoxes([
      { type:'cyl', rt:r, rb:r*0.74, h:len, y:-len/2 },
      { type:'sph', r:r*1.06, sy:0.92 }
    ]), mat || skin);
  }
  function boneUp(w, len, d, mat){
    var r2 = w * 0.5;
    return new THREE.Mesh(mergeBoxes([
      { type:'cyl', rt:r2*0.74, rb:r2, h:len, y:len/2 },
      { type:'sph', r:r2*1.06, sy:0.92 }
    ]), mat || skin);
  }""", 'bone')

# 胴：箱 3 段 → 先細りの筒。肋は潰した球
rep("""  var torsoSpecs = [
    { w:0.50, h:0.46, d:0.26, y:0.78 },
    { w:0.29, h:0.44, d:0.19, y:0.36 },
    { w:0.36, h:0.22, d:0.24, y:0.04 }
  ];
  for(var ri=0; ri<5; ri++)
    torsoSpecs.push({ w:0.46-ri*0.045, h:0.035, d:0.29-ri*0.012, y:0.66-ri*0.085, z:0.005 });
  for(var si=0; si<7; si++)
    torsoSpecs.push({ w:0.06, h:0.055, d:0.06, y:0.14+si*0.105, z:-0.13 });""",
"""  /* 胴は角柱をやめ、胸→腹→腰と細くなる筒でつなぐ。
     肋と背骨は、潰した球を並べて皮の下の隆起にする（板を貼るより丸い）。 */
  var torsoSpecs = [
    { type:'cyl', rt:0.235, rb:0.155, h:0.48, y:0.78, sz:1 },   // 胸
    { type:'cyl', rt:0.155, rb:0.135, h:0.44, y:0.36 },         // 腹
    { type:'cyl', rt:0.135, rb:0.175, h:0.24, y:0.04 },         // 腰
    { type:'sph', r:0.235, sy:0.62, y:1.00 },                   // 肩の上端を丸める
    { type:'sph', r:0.175, sy:0.72, y:-0.06 }                   // 骨盤の下端
  ];
  for(var ri=0; ri<5; ri++)
    torsoSpecs.push({ type:'sph', r:0.115-ri*0.009, sy:0.24, sz:1.18,
                      y:0.66-ri*0.085, z:0.045 });
  for(var si=0; si<7; si++)
    torsoSpecs.push({ type:'sph', r:0.036, sy:0.85, y:0.14+si*0.105, z:-0.125 });""", 'torso')

# 首は筒
rep("""  var neck = boneUp(0.10, 0.26, 0.10);""",
    """  var neck = boneUp(0.10, 0.26, 0.10);""", 'neck')

# 頭蓋：箱 → 縦につぶした球。鼻梁だけ箱を残す
rep("""  headPivot.add(new THREE.Mesh(mergeBoxes([
    { w:0.235, h:0.25,  d:0.25,  y:0.09 },
    { w:0.25,  h:0.055, d:0.045, y:0.13, z:0.115 }
  ]), skin));""",
"""  /* 頭蓋は球にする。人の頭で角が立っているところは無い。
     縦にわずかに伸ばし、後頭部を少し出すと骸骨らしい輪郭になる。
     眉の張り出しだけは箱で残す（丸めると顔が消える）。 */
  headPivot.add(new THREE.Mesh(mergeBoxes([
    { type:'sph', r:0.125, sy:1.06, sz:1.04, y:0.09 },
    { type:'sph', r:0.095, sy:0.86, y:0.075, z:-0.055 },
    { type:'sph', r:0.072, sy:0.70, sz:0.85, y:0.015, z:0.075 },
    { w:0.25,  h:0.048, d:0.045, y:0.135, z:0.100 }
  ]), skin));""", 'skull')

# 髪と歯と指も丸める
rep("""    darkSpecs.push({
      w:0.052, h:hl, d:0.038,
      x:Math.sin(ang)*0.113, y:0.21-hl/2, z:Math.cos(ang)*0.113,
      rz:-Math.sin(ang)*0.16
    });""",
"""    darkSpecs.push({
      type:'cyl', rt:0.026, rb:0.012, h:hl,
      x:Math.sin(ang)*0.113, y:0.21-hl/2, z:Math.cos(ang)*0.113,
      rz:-Math.sin(ang)*0.16
    });""", 'hair')

rep("""  for(var ti=0; ti<5; ti++)
    teethSpecs.push({ w:0.022, h:0.045, d:0.022, x:-0.06+ti*0.03, y:-0.02, z:0.1 });""",
"""  for(var ti=0; ti<5; ti++)
    teethSpecs.push({ type:'cyl', rt:0.012, rb:0.004, h:0.048,
                      x:-0.06+ti*0.03, y:-0.02, z:0.1, rx:Math.PI });""", 'teeth')

rep("""    for(var f=0; f<4; f++)
      fg.push({ w:0.02, h:0.24-(f%2)*0.05, d:0.02, x:-0.03+f*0.02, y:-0.17, z:0.005, rx:0.25 });""",
"""    for(var f=0; f<4; f++){
      var fl = 0.24-(f%2)*0.05;
      fg.push({ type:'cyl', rt:0.011, rb:0.005, h:fl,
                x:-0.03+f*0.02, y:-0.05-fl/2, z:0.005, rx:0.25 });
      fg.push({ type:'sph', r:0.012, sy:0.9, x:-0.03+f*0.02, y:-0.05, z:0.005 });
    }""", 'fingers')

# 病衣の短冊も、平らな板から少し丸みのある面にする
rep("""    var strip = new THREE.Mesh(new THREE.PlaneGeometry(0.115, glen), gownMat);""",
"""    var strip = new THREE.Mesh(new THREE.CylinderGeometry(0.062, 0.052, glen, 5, 1, true,
                                                          -0.9, 1.8), gownMat);""", 'gown')
rep("""    strip.position.set(0, -glen/2, 0.012);""",
"""    strip.position.set(0, -glen/2, 0.012);
    strip.rotation.y = Math.PI;""", 'gown-pos')

rep("""  var pupL = new THREE.Mesh(new THREE.BoxGeometry(0.022,0.022,0.012), eyeL_);""",
    """  var pupGeo = new THREE.SphereGeometry(0.0145, 6, 4);
  var pupL = new THREE.Mesh(pupGeo, eyeL_);""", 'pup')

open(p,'w').write(s)
print('モデルのパッチ適用')

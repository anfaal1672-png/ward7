import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

rep("""  var torso = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.58, 0.24), cloth);
  torso.position.y = 1.16; g.add(torso);
  var head = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.25, 0.22), skin);
  head.position.y = 1.57; g.add(head);
  var hair = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.10, 0.24),
                            new THREE.MeshStandardMaterial({ color:0x1a1614, roughness:1 }));
  hair.position.y = 1.68; g.add(hair);""",
"""  /* 胴は 1 枚の箱ではなく、胸・腹・腰の 3 段にする。
     追う側から見えるのはほとんど輪郭だけなので、
     肩の落ち方と腰のくびれがあるかどうかで人らしさが決まる。 */
  var chest = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.30, 0.25), cloth);
  chest.position.y = 1.30; g.add(chest);
  var belly = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.22, 0.22), cloth);
  belly.position.y = 1.06; g.add(belly);
  var hips  = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.23), pants);
  hips.position.y = 0.92; g.add(hips);
  // 襟。首の付け根に影が落ちて、頭が胴に埋まって見えなくなる
  var collar = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.05, 0.24),
                              new THREE.MeshStandardMaterial({ color:0x39423e, roughness:0.95 }));
  collar.position.y = 1.455; g.add(collar);
  var neck2 = new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.07, 0.10), skin);
  neck2.position.y = 1.49; g.add(neck2);

  var head = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.24, 0.21), skin);
  head.position.y = 1.62; g.add(head);
  var hairM = new THREE.MeshStandardMaterial({ color:0x1a1614, roughness:1 });
  var hair = new THREE.Mesh(new THREE.BoxGeometry(0.225, 0.11, 0.235), hairM);
  hair.position.y = 1.725; head.add(hair); hair.position.y = 0.105;
  // 後ろ髪。真後ろから見たときに頭が箱に見えないように
  var hairB = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.17, 0.06), hairM);
  hairB.position.set(0, 0.01, -0.095); head.add(hairB);""", 'torso')

rep("""  var legL = limb(0.13, 0.86, pants); legL.position.set( 0.11, 0.87, 0);
  var legR = limb(0.13, 0.86, pants); legR.position.set(-0.11, 0.87, 0);""",
"""  var legL = limb(0.13, 0.80, pants); legL.position.set( 0.10, 0.86, 0);
  var legR = limb(0.13, 0.80, pants); legR.position.set(-0.10, 0.86, 0);
  // 靴。足元が地面に接している手がかりになる
  var shoeM = new THREE.MeshStandardMaterial({ color:0x15181a, roughness:0.85 });
  [legL, legR].forEach(function(lg){
    var sh2 = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.07, 0.24), shoeM);
    sh2.position.set(0, -0.815, 0.03); lg.add(sh2);
  });""", 'legs')

# ランプの光の筋。追う側にとっていちばんの手がかり
rep("""  var spot = new THREE.SpotLight(0xfff0d0, 0, 18, 0.52, 0.55, 1.6);""",
"""  /* 光の筋を目に見える形で出す。追う側にとって、廊下の先で揺れる光の筋が
     いちばんの手がかりになる。加算合成の円錐を光と同じ向きに置く。 */
  var beamMat = new THREE.MeshBasicMaterial({
    color:0xffe9c0, transparent:true, opacity:0.0, side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending, depthWrite:false
  });
  var beamGeo = new THREE.ConeGeometry(1.25, 6.4, 14, 1, true);
  beamGeo.translate(0, -3.2, 0);
  var beam = new THREE.Mesh(beamGeo, beamMat);
  beam.frustumCulled = false;
  scene.add(beam);

  var spot = new THREE.SpotLight(0xfff0d0, 0, 18, 0.52, 0.55, 1.6);""", 'beam')

rep("""  avatar = { group:g, head:head, armL:armL, armR:armR, legL:legL, legR:legR,
             lampMat:lampMat, spot:spot, tgt:tgt, phase:0 };""",
"""  avatar = { group:g, head:head, armL:armL, armR:armR, legL:legL, legR:legR,
             lampMat:lampMat, spot:spot, tgt:tgt, beam:beam, phase:0 };""", 'parts')

rep("""  a.spot.intensity = lit ? 3.0 : 0;""",
"""  a.spot.intensity = lit ? 3.0 : 0;
  // 光の筋。ランプと同じ位置・向きに置き、明滅も合わせる
  if(a.beam){
    var bw = lit ? 0.085 + 0.02*Math.sin(performance.now()*0.011) : 0;
    a.beam.material.opacity += (bw - a.beam.material.opacity) * (1 - Math.pow(0.02, dt));
    a.beam.visible = a.beam.material.opacity > 0.002;
    if(a.beam.visible){
      a.beam.position.copy(a.spot.position);
      a.beam.rotation.set(0, player.viewYaw, 0);
      a.beam.rotateX(Math.PI/2 + player.pitch);
    }
  }""", 'beam-anim')

rep("""  if(hiding){ a.spot.intensity = 0; return; }""",
"""  if(hiding){
    a.spot.intensity = 0;
    if(a.beam) a.beam.visible = false;
    return;
  }""", 'hide-beam')

rep("""  }else if(avatar){
    scene.remove(avatar.group); scene.remove(avatar.spot); scene.remove(avatar.tgt);
    disposeObject(avatar.group); avatar = null;
  }""",
"""  }else if(avatar){
    scene.remove(avatar.group); scene.remove(avatar.spot); scene.remove(avatar.tgt);
    if(avatar.beam){ scene.remove(avatar.beam); avatar.beam.geometry.dispose(); avatar.beam.material.dispose(); }
    disposeObject(avatar.group); avatar = null;
  }""", 'dispose')
open(p,'w').write(s)
print('分身のパッチ適用')

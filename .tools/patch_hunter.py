import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# 病衣。腰から下がる裂けた布。輪郭が増え、動きに遅れが出る
rep("""  // --- 肩から垂れる、長すぎる髪の束。動きが本体から遅れる ---
  var strands = [];
  var sn2 = QC.detail ? 3 : 2;""",
"""  /* --- 病衣の裂けた裾 ---
     骨と皮だけだと、暗がりでは棒に見える。腰から下がった布があると
     輪郭が出て、歩くたびに遅れて揺れるぶん「重さ」も伝わる。
     板ではなく細い短冊の集まりにして、裂けた裾に見せる。 */
  var gownMat = new THREE.MeshStandardMaterial({
    color:0xb9b3a0, roughness:1, side:THREE.DoubleSide,
    emissive:0x14160f, emissiveIntensity:0.35
  });
  var gown = [];
  var gn = QC.detail ? 11 : 7;
  for(var gi=0; gi<gn; gi++){
    var ga = (gi/gn)*TAU;
    var gpv = new THREE.Group();
    gpv.position.set(Math.sin(ga)*0.155, 0.30, Math.cos(ga)*0.115);
    gpv.rotation.y = ga;
    spine.add(gpv);
    var glen = 0.42 + ((gi*7)%5)*0.075;          // 裾の長さを不揃いに
    var strip = new THREE.Mesh(new THREE.PlaneGeometry(0.115, glen), gownMat);
    strip.position.set(0, -glen/2, 0.012);
    gpv.add(strip);
    gown.push(gpv);
  }

  // --- 肩から垂れる、長すぎる髪の束。動きが本体から遅れる ---
  var strands = [];
  var sn2 = QC.detail ? 5 : 2;""", 'gown')

rep("""    strands:strands, skin:skin, baseY:(0.02 + THIGH + SOLE)""",
    """    strands:strands, gown:gown, skin:skin, baseY:(0.02 + THIGH + SOLE)""", 'parts')

rep("""  // 髪束は本体より遅れて揺れる""",
"""  /* 病衣の裾は髪より重い。遅れを大きく、戻りを鈍くする。
     歩幅（sw）に合わせて前後へ振れ、走ると後ろへ流れる。 */
  if(P.gown){
    var gsw = sw*0.34 + (chasing ? 0.22 : 0);
    for(var gj=0; gj<P.gown.length; gj++){
      var gp = P.gown[gj];
      var want = gsw*Math.cos(gp.rotation.y) + Math.sin(now*0.8 + gj*1.7)*0.09;
      gp.rotation.x = lerp(gp.rotation.x, want, 1 - Math.pow(0.55, dt));
    }
  }

  // 髪束は本体より遅れて揺れる""", 'gown-anim')
open(p,'w').write(s)
print('追跡者のパッチ適用')

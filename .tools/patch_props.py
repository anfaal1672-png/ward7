# 病棟らしい什器を足す。点滴スタンド・ストレッチャー・車椅子。
# どれも手続きの箱と円筒だけで組む（外部モデルは持たない方針）。
import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
old = """  // --- 小物（ドラム缶）：InstancedMesh + 円形コリジョン ---"""
new = """  /* --- 病棟の什器 ---------------------------------------------------------
     机とロッカーとドラム缶しか無かったので、どの廊下も同じ顔をしていた。
     病院にあるものを 3 種類足す。どれも箱と円筒の組み合わせで、
     形の輪郭だけで何か分かるように寸法を実物に寄せてある。
     視線は遮らない高さ（1.05）にしてある——細い支柱や車椅子の向こうが
     見えないのは不自然だし、隠れ場所として機能してしまう。 */
  var mtlSteel = new THREE.MeshStandardMaterial({ color:0x9aa3a1, roughness:0.42, metalness:0.72 });
  var mtlPaint = new THREE.MeshStandardMaterial({ color:0x5c6b68, roughness:0.72, metalness:0.18 });
  var mtlSheet = new THREE.MeshStandardMaterial({ color:0xc8c6b6, roughness:0.94 });
  var mtlBag   = new THREE.MeshStandardMaterial({ color:0xd7e2cf, roughness:0.35,
                                                  transparent:true, opacity:0.72 });
  var mtlTire  = new THREE.MeshStandardMaterial({ color:0x24282a, roughness:0.95 });

  // 点滴スタンド：細い支柱、五本脚、袋がひとつ下がっている
  var ivN = Math.max(2, Math.round(QC.props / 9));
  for(var iv=0; iv<ivN; iv++){
    var isp = wallCellNear();
    if(!isp) break;
    var iw = cellToWorld(isp.cell.x, isp.cell.y);
    var ig = new THREE.Group();
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 1.72, 6), mtlSteel);
    pole.position.y = 0.86; ig.add(pole);
    var hook = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.010, 4, 8), mtlSteel);
    hook.position.y = 1.70; hook.rotation.x = Math.PI/2; ig.add(hook);
    for(var il=0; il<5; il++){
      var la = il/5*TAU;
      var leg = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.022, 0.26), mtlSteel);
      leg.position.set(Math.cos(la)*0.13, 0.03, Math.sin(la)*0.13);
      leg.rotation.y = -la; ig.add(leg);
    }
    if(rnd() < 0.75){
      var bag = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.24, 0.05), mtlBag);
      bag.position.set(0.055, 1.52, 0); bag.rotation.z = -0.06; ig.add(bag);
      var tube = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.52, 4), mtlBag);
      tube.position.set(0.075, 1.16, 0.01); tube.rotation.z = 0.16; ig.add(tube);
    }
    ig.position.set(iw.x + isp.dir[0]*(CELL/2 - 0.42) + (rnd()-0.5)*0.3, 0,
                    iw.z + isp.dir[1]*(CELL/2 - 0.42) + (rnd()-0.5)*0.3);
    ig.rotation.y = rnd()*TAU;
    ig.userData.bake = true;
    world.group.add(ig);
    world.props.push({ x:ig.position.x, z:ig.position.z, r:0.22, h:1.05 });
  }

  // ストレッチャー：寝台。廊下に斜めに置き去りにされている
  var gyN = Math.max(1, Math.round(QC.props / 14));
  for(var gy=0; gy<gyN; gy++){
    var gsp = wallCellNear();
    if(!gsp) break;
    var gw = cellToWorld(gsp.cell.x, gsp.cell.y);
    var gg = new THREE.Group();
    var pad = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.10, 0.66), mtlSheet);
    pad.position.y = 0.74; gg.add(pad);
    var frame = new THREE.Mesh(new THREE.BoxGeometry(1.92, 0.06, 0.72), mtlPaint);
    frame.position.y = 0.66; gg.add(frame);
    for(var gr=0; gr<2; gr++){            // 側面の柵。片方だけ下ろしてある
      if(gr === 1 && rnd() < 0.5) continue;
      var rail = new THREE.Mesh(new THREE.BoxGeometry(1.10, 0.026, 0.026), mtlSteel);
      rail.position.set(0, 0.98, (gr ? 1 : -1) * 0.34); gg.add(rail);
      for(var rp=0; rp<2; rp++){
        var post = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.30, 0.026), mtlSteel);
        post.position.set((rp ? 1 : -1) * 0.52, 0.84, (gr ? 1 : -1) * 0.34); gg.add(post);
      }
    }
    for(var gl=0; gl<4; gl++){
      var gleg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.56, 5), mtlSteel);
      gleg.position.set((gl%2?1:-1)*0.78, 0.34, (gl<2?1:-1)*0.28); gg.add(gleg);
      var cast = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.065, 0.05, 8), mtlTire);
      cast.rotation.z = Math.PI/2;
      cast.position.set((gl%2?1:-1)*0.78, 0.065, (gl<2?1:-1)*0.28); gg.add(cast);
    }
    gg.position.set(gw.x + (rnd()-0.5)*0.5, 0, gw.z + (rnd()-0.5)*0.5);
    gg.rotation.y = Math.atan2(-gsp.dir[0], -gsp.dir[1]) + (rnd()-0.5)*0.7;
    gg.userData.bake = true;
    world.group.add(gg);
    world.props.push({ x:gg.position.x, z:gg.position.z, r:0.72, h:1.05 });
  }

  // 車椅子：壁を向いて置かれている
  var wcN = Math.max(1, Math.round(QC.props / 16));
  for(var wc2=0; wc2<wcN; wc2++){
    var wsp = wallCellNear();
    if(!wsp) break;
    var ww = cellToWorld(wsp.cell.x, wsp.cell.y);
    var wg = new THREE.Group();
    var seat = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.06, 0.44), mtlPaint);
    seat.position.y = 0.50; wg.add(seat);
    var back = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.05), mtlPaint);
    back.position.set(0, 0.76, -0.21); back.rotation.x = -0.10; wg.add(back);
    for(var wh=0; wh<2; wh++){
      var big = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.022, 4, 14), mtlTire);
      big.position.set((wh?1:-1)*0.28, 0.30, -0.02); big.rotation.y = Math.PI/2; wg.add(big);
      var rim = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.012, 4, 12), mtlSteel);
      rim.position.copy(big.position); rim.rotation.y = Math.PI/2; wg.add(rim);
      var small = new THREE.Mesh(new THREE.TorusGeometry(0.10, 0.018, 4, 10), mtlTire);
      small.position.set((wh?1:-1)*0.20, 0.10, 0.32); small.rotation.y = Math.PI/2; wg.add(small);
      var arm = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.40), mtlSteel);
      arm.position.set((wh?1:-1)*0.25, 0.70, 0.02); wg.add(arm);
    }
    wg.position.set(ww.x + wsp.dir[0]*(CELL/2 - 0.55), 0, ww.z + wsp.dir[1]*(CELL/2 - 0.55));
    wg.rotation.y = Math.atan2(-wsp.dir[0], -wsp.dir[1]) + Math.PI + (rnd()-0.5)*0.5;
    wg.userData.bake = true;
    world.group.add(wg);
    world.props.push({ x:wg.position.x, z:wg.position.z, r:0.42, h:1.05 });
  }

  // --- 小物（ドラム缶）：InstancedMesh + 円形コリジョン ---"""
assert old in s, 'props'
s = s.replace(old, new, 1)
open(p, 'w').write(s)
print('什器パッチ適用')

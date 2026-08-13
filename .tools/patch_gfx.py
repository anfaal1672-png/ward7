import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# 品質表に埃と光芒を足す
rep("""    bloom:    q >= 3,          // 最高品質のみ：光が滲む（縮小バッファ＋分離ブラー）""",
"""    bloom:    q >= 3,          // 最高品質のみ：光が滲む（縮小バッファ＋分離ブラー）
    dust:     q >= 2,          // 高精細以上：ランプの光に舞う埃
    shaft:    q >= 2,          // 高精細以上：非常口から差す光""", 'qc')

# --- 埃と光芒の本体 ---
rep("""/* ---- ポストプロセス（色収差・ノイズ・走査線・歪み） ----""",
"""/* ---- 空気中の埃 ------------------------------------------------------
   暗い場所でランプを振ったとき、光の筋が見えるかどうかで空気の有無が決まる。
   本物の体積光は高いので、光の中を漂う粒を置いて代わりにする。
   粒はプレイヤーの周り 7m の箱に散らし、動いたら箱の外に出たぶんだけ
   反対側へ回り込ませる（無限に湧いているように見える）。
   ランプが消えているときは薄くする——照らされていない埃は見えない。 */
var dustPts = null, dustPos = null;
var DUST_BOX = 7.0;

function buildDust(){
  if(dustPts){ scene.remove(dustPts); dustPts.geometry.dispose(); dustPts = null; }
  if(!QC.dust) return;
  var n = (settings.quality >= 3) ? 520 : 260;
  dustPos = new Float32Array(n*3);
  for(var i=0;i<n;i++){
    dustPos[i*3]   = (Math.random()-0.5)*DUST_BOX*2;
    dustPos[i*3+1] = Math.random()*2.6;
    dustPos[i*3+2] = (Math.random()-0.5)*DUST_BOX*2;
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  var m = new THREE.PointsMaterial({
    size:0.028, map:TEX.glowW, transparent:true, opacity:0.0,
    blending:THREE.AdditiveBlending, depthWrite:false, sizeAttenuation:true,
    color:0xffeccf
  });
  dustPts = new THREE.Points(g, m);
  dustPts.frustumCulled = false;
  scene.add(dustPts);
}

function updateDust(dt){
  if(!dustPts) return;
  var arr = dustPos, n = arr.length/3;
  var t = performance.now()*0.001;
  for(var i=0;i<n;i++){
    var k = i*3;
    // ゆっくり漂う。上下は正弦、水平はごく弱い流れ
    arr[k]   += Math.sin(t*0.21 + i)*0.0016 + dt*0.02;
    arr[k+1] += Math.sin(t*0.33 + i*1.7)*0.0022;
    arr[k+2] += Math.cos(t*0.19 + i*0.7)*0.0016;
    // プレイヤーを中心とした箱の中へ折り返す
    var dx = arr[k] + dustPts.position.x - player.x;
    if(dx >  DUST_BOX) arr[k] -= DUST_BOX*2; else if(dx < -DUST_BOX) arr[k] += DUST_BOX*2;
    var dz = arr[k+2] + dustPts.position.z - player.z;
    if(dz >  DUST_BOX) arr[k+2] -= DUST_BOX*2; else if(dz < -DUST_BOX) arr[k+2] += DUST_BOX*2;
    if(arr[k+1] > 2.7) arr[k+1] = 0.05; else if(arr[k+1] < 0) arr[k+1] = 2.6;
  }
  dustPts.geometry.attributes.position.needsUpdate = true;
  dustPts.position.set(player.x, 0, player.z);
  // 照らされていない埃は見えない。ランプの状態に合わせて濃さを変える
  var want = player.lamp ? 0.30 : 0.05;
  var mo = dustPts.material.opacity;
  dustPts.material.opacity = mo + (want - mo) * (1 - Math.pow(0.05, dt));
}

/* ---- 非常口から差す光 --------------------------------------------------
   扉が開いた瞬間、そこが目的地だと一目で分かってほしい。
   加算合成の円錐を扉から通路側へ寝かせて置く。体積光の代わりだが、
   暗い廊下ではこれで十分に「光が漏れている」に見える。 */
var exitShaft = null;
function buildExitShaft(){
  if(exitShaft){ scene.remove(exitShaft); exitShaft.geometry.dispose(); exitShaft.material.dispose(); exitShaft = null; }
  if(!QC.shaft || !world.exit) return;
  var geo = new THREE.ConeGeometry(1.45, 5.2, 12, 1, true);
  geo.translate(0, -2.6, 0);            // 頂点を原点に置く
  var mat = new THREE.MeshBasicMaterial({
    color:0xff5a4a, transparent:true, opacity:0.0, side:THREE.DoubleSide,
    blending:THREE.AdditiveBlending, depthWrite:false
  });
  exitShaft = new THREE.Mesh(geo, mat);
  exitShaft.frustumCulled = false;
  scene.add(exitShaft);
}
function updateExitShaft(dt){
  if(!exitShaft || !world.exit) return;
  var open = world.exit.open;
  var want = open ? 0.16 + 0.05*Math.sin(performance.now()*0.0031) : 0;
  var mo = exitShaft.material.opacity;
  exitShaft.material.opacity = mo + (want - mo) * (1 - Math.pow(0.1, dt));
  if(exitShaft.material.opacity < 0.002) return;
  exitShaft.position.set(world.exit.doorX, 2.15, world.exit.doorZ);
  // 扉の面から通路側へ倒す
  var dx = world.exit.x - world.exit.doorX, dz = world.exit.z - world.exit.doorZ;
  var l = Math.sqrt(dx*dx + dz*dz) || 1;
  exitShaft.rotation.set(0, Math.atan2(dx/l, dz/l), 0);
  exitShaft.rotateX(Math.PI/2 - 0.30);
}

/* ---- ポストプロセス（色収差・ノイズ・走査線・歪み） ----""", 'dust')

# 生成の呼び出し（ワールド構築の後）
rep("""  if(BOT.on) botReset();
  huntReset();""",
"""  buildDust();
  buildExitShaft();
  if(BOT.on) botReset();
  huntReset();""", 'build-call')

# 毎フレームの更新
rep("""  ambientCreakT -= dt;""",
"""  updateDust(dt);
  updateExitShaft(dt);

  ambientCreakT -= dt;""", 'update-call')

# 色調整。暗部を少し青緑へ持ち上げ、明部を寝かせる
rep("""      '  col += texture2D(tBloom, uv).rgb * uBloom;',        // 光の滲み""",
"""      '  col += texture2D(tBloom, uv).rgb * uBloom;',        // 光の滲み,
      // 色調整。暗部をわずかに青緑へ持ち上げ、明部の伸びを寝かせる。
      // 真っ黒が本当に 0 だと、暗い画面が「消えている」ように見える
      '  col = col / (col + vec3(0.28)) * 1.28;',
      '  col += vec3(0.004, 0.011, 0.010) * (1.0 - smoothstep(0.0, 0.30, col));',""", 'grade')
open(p,'w').write(s)
print('グラフィックのパッチ適用')

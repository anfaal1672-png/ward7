import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# タイトル用の情景。実際の病棟を建てて、その中をゆっくり漂う
rep("""/* =========================================================================
   20. 起動""",
"""/* =========================================================================
   22. タイトルの情景
   =========================================================================
   これまでタイトルは平らな暗い背景の上に文字が乗っているだけだった。
   実際に病棟を建てて、その中をカメラがゆっくり漂う。
   「これから入る場所」を先に見せておくと、扉を開ける前から空気が伝わる。

   遊ぶときのワールドとは別物にしない。startGame が同じ手順で建て直すので、
   ここで建てたものはそのまま捨てられる。 */
var titleCam = { t:0, x:0, z:0, yaw:0, tx:0, tz:0, ready:false };

function buildTitleScene(){
  try{
    forcedSeed = null;
    rnd = mulberry32((Date.now() ^ (Math.random()*1e9)) & 0x7fffffff);
    buildInfo = buildWorld();
    if(hunter.group){ hunter.group.visible = false; hunter.shadow.visible = false; }
    // 通路のどこかに置き、そこから見て開けている向きへ向ける
    var st = buildInfo.reach[(rnd()*buildInfo.reach.length)|0];
    var w = cellToWorld(st.x, st.y);
    titleCam.x = w.x; titleCam.z = w.z; titleCam.t = 0;
    var best = 0, bestOpen = -1;
    for(var d4=0; d4<4; d4++){
      var a = d4 * Math.PI/2, open = 0;
      for(var dd=0.5; dd<24; dd+=0.5){
        var c = worldToCell(titleCam.x - Math.sin(a)*dd, titleCam.z - Math.cos(a)*dd);
        if(!inBounds(c.x,c.y) || world.grid[idx(c.x,c.y)] !== 0) break;
        open = dd;
      }
      if(open > bestOpen){ bestOpen = open; best = a; }
    }
    titleCam.yaw = best;
    titleCam.ready = true;
  }catch(e){ titleCam.ready = false; }
}

function updateTitleScene(dt){
  if(!titleCam.ready) return;
  titleCam.t += dt;
  // 前へじわりと進み、行き止まりに近づいたら向きを変える
  var fx = -Math.sin(titleCam.yaw), fz = -Math.cos(titleCam.yaw);
  var ahead = 0;
  for(var dd=0.5; dd<7; dd+=0.5){
    var c = worldToCell(titleCam.x + fx*dd, titleCam.z + fz*dd);
    if(!inBounds(c.x,c.y) || world.grid[idx(c.x,c.y)] !== 0) break;
    ahead = dd;
  }
  if(ahead < 2.0) titleCam.yaw += Math.PI/2 * (Math.sin(titleCam.t*0.37) > 0 ? 1 : -1);
  else { titleCam.x += fx * dt * 0.42; titleCam.z += fz * dt * 0.42; }
  // 首の揺れ。完全な直線移動は機械に見える
  var sway = Math.sin(titleCam.t*0.53)*0.05 + Math.sin(titleCam.t*0.21)*0.03;
  camera.position.set(titleCam.x, 1.62 + Math.sin(titleCam.t*0.8)*0.02, titleCam.z);
  camera.rotation.set(Math.sin(titleCam.t*0.31)*0.03, titleCam.yaw + sway, Math.sin(titleCam.t*0.43)*0.012);
  // タイトルでは手元のランプを持っていない。環境光だけで見せる
  if(flashlight) flashlight.intensity = 0;
  if(playerLight) playerLight.intensity = 0.22;
  ambient.intensity = 0.30;
  updateDust(dt);
}

/* =========================================================================
   20. 起動""", 'scene')

# ループでタイトルも描く
rep("""  // 全面パネルが出ている間は裏で描き続けない（死亡時のカメラ演出だけは描く）
  var needRender = (state === STATE.PLAY || state === STATE.DEAD);""",
"""  if(state === STATE.TITLE) updateTitleScene(dt);

  // 全面パネルが出ている間は裏で描き続けない（死亡時のカメラ演出だけは描く）
  var needRender = (state === STATE.PLAY || state === STATE.DEAD ||
                    (state === STATE.TITLE && titleCam.ready));""", 'loop')

# 起動時に建てる
rep("""  bootedOK = true;
  state = STATE.TITLE;""",
"""  buildTitleScene();
  buildDust();

  bootedOK = true;
  state = STATE.TITLE;""", 'boot')

# タイトルへ戻ったときも情景を出す（遊んだ後のワールドをそのまま使う）
rep("""function toTitle(){
  state = STATE.TITLE;""",
"""function toTitle(){
  state = STATE.TITLE;
  // 遊んだ後のワールドをそのまま情景に使う。建て直すと待たされる
  if(world.grid){
    titleCam.x = player.x; titleCam.z = player.z; titleCam.yaw = player.yaw; titleCam.t = 0;
    titleCam.ready = true;
  }""", 'totitle')
open(p,'w').write(s)
print('タイトル情景のパッチ適用')

/* =========================================================================
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
    // buildWorld は間取りの情報を返す。startGame と同じように受け取る
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
  }catch(e){ titleCam.ready = false; console.warn('タイトル情景の構築に失敗:', e && e.message); }
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
  /* タイトルでは手元のランプを持っていない設定だが、環境光だけに任せると
     実測で画面の平均輝度が 5.3（最大 58）しか無く、3D の廊下が置いてある
     ことすら伝わらない真っ黒だった。露出曲線を直線寄りにしたぶん、
     以前の持ち上げに頼っていた明るさが消えたため。
     手元の弱い明かりだけを足して、奥は闇に落としたまま輪郭を見せる。 */
  if(flashlight) flashlight.intensity = 0;
  if(playerLight) playerLight.intensity = 1.9;
  ambient.intensity = 0.74;
  /* 露出。タイトルでは updateExposure が回らないので、直前の 1 回で
     決まった倍率がそのまま残る。死亡演出の後は 1.18 倍のまま情景が
     明るく、遊び直して壁際で死ぬと 0.62 倍のまま暗い——同じ画面が
     毎回違う明るさで出ていた。ここで基準に戻す。 */
  expAdapt = 1;
  renderer.toneMappingExposure = exposureNow();
  updateDust(dt);
}


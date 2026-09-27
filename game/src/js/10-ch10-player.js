/* =========================================================================
   10. プレイヤー
   ========================================================================= */
var player = {
  x:0, z:0, y:1.62, yaw:0, pitch:0,
  vx:0, vz:0, hp:100, battery:100, stamina:100, sanity:100,
  lamp:true, running:false, exhausted:false, bob:0, stepAcc:0, breath:0,
  hiding:null, hideSeen:false, blockedT:0, holdBreath:false, breathBroken:0, breathLock:false, hasKey:false,
  lookBackT:0, viewYaw:0,
  got:0, need:5, time:0, hurtT:0, deadT:0, shake:0, radius:0.42
};

// 家具（円で近似）から押し出す。プレイヤーと追跡者の両方で使う
function pushOutOfSolids(px, pz, R){
  var list = world.props;
  for(var i=0;i<list.length;i++){
    var o = list[i];
    var dx = px - o.x, dz = pz - o.z;
    var d2 = dx*dx + dz*dz;
    var rr = o.r + R;
    if(d2 < rr*rr){
      var d = Math.sqrt(d2);
      if(d < 1e-4){ px += rr; continue; }
      px = o.x + dx/d*rr;
      pz = o.z + dz/d*rr;
    }
  }
  return { x:px, z:pz };
}

// 壁への食い込みを最小距離で押し戻す（瞬間移動させないための共通処理）
function pushOutOfWalls(px, pz, R){
  var g = world.grid;
  var c0 = worldToCell(px - R, pz - R), c1 = worldToCell(px + R, pz + R);
  for(var yy=c0.y; yy<=c1.y; yy++){
    for(var xx=c0.x; xx<=c1.x; xx++){
      if(!inBounds(xx,yy)) continue;
      if(g[idx(xx,yy)] === 0) continue;
      var w = cellToWorld(xx,yy), half = CELL/2;
      var dx = px - w.x, dz = pz - w.z;
      var ox = (half + R) - Math.abs(dx);
      var oz = (half + R) - Math.abs(dz);
      if(ox > 0 && oz > 0){
        if(ox < oz) px += (dx < 0 ? -ox : ox);
        else        pz += (dz < 0 ? -oz : oz);
      }
    }
  }
  return { x:px, z:pz };
}

function collideMove(nx, nz){
  var g = world.grid, R = player.radius;
  function blocked(px, pz){
    // グリッド壁
    var c0 = worldToCell(px - R, pz - R);
    var c1 = worldToCell(px + R, pz + R);
    for(var yy=c0.y; yy<=c1.y; yy++){
      for(var xx=c0.x; xx<=c1.x; xx++){
        if(!inBounds(xx,yy)) return true;
        // 施錠された扉の向こうへは入れない
        if(world.lockDoor && !world.lockDoor.open &&
           xx === world.lockDoor.cell.x && yy === world.lockDoor.cell.y) return true;
        if(g[idx(xx,yy)] !== 0){
          var w = cellToWorld(xx,yy);
          var half = CELL/2;
          var dx = Math.abs(px - w.x) - half;
          var dz = Math.abs(pz - w.z) - half;
          if(dx < R && dz < R) return true;
        }
      }
    }
    return false;
  }
  // 軸ごとに解決（壁ずり）
  var ox = player.x, oz = player.z;
  if(!blocked(nx, oz)) player.x = nx;
  if(!blocked(player.x, nz)) player.z = nz;

  // 家具・什器
  var fixed = pushOutOfSolids(player.x, player.z, R);
  player.x = fixed.x; player.z = fixed.z;
  if(!isFinite(player.x) || !isFinite(player.z)){ player.x = ox; player.z = oz; }
}


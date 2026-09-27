/* =========================================================================
   10. プレイヤー
   ========================================================================= */
var player = {
  x:0, z:0, y:1.62, yaw:0, pitch:0,
  vx:0, vz:0, hp:100, battery:100, stamina:100, sanity:100,
  lamp:true, running:false, exhausted:false, bob:0, stepAcc:0, breath:0,
  hiding:null, hideSeen:false, blockedT:0, holdBreath:false, breathBroken:0, breathLock:false, hasKey:false,
  lookBackT:0, viewYaw:0,
  got:0, need:5, time:0, hurtT:0, deadT:0, shake:0, radius:0.42,
  sneaking:false, bottles:0
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


/* --- 忍び足と投擲（設計指示書 第 5.2 節） --------------------------------
   忍び足：歩きの 55% 未満で動いている間は足音を絞り、追跡者の聴覚距離も
   ほぼ立ち止まっているときと同じに縮む。遅いぶん距離が稼げない。
   投擲：瓶を視線の先へ放る。割れた場所へ、聞こえる範囲の追跡者が
   向かう（姿を見て追っている最中は釣られない）。 */
var SNEAK_V = 1.75;          // これ未満の速さなら忍び足（歩きは 3.11 m/s）
var SNEAK_LEN = 0.45;        // PC の忍び足キーで抑える入力の大きさ
var BOTTLE_MAX = 2;          // 同時に持てる瓶の数
var THROW_V = 9.5;           // 投げ出す速さ（m/s）
var throws = [];
function clearThrows(){
  throws.forEach(function(t){ if(t.mesh && t.mesh.parent) t.mesh.parent.remove(t.mesh); });
  throws = [];
}
function throwBottle(){
  if(state !== STATE.PLAY || player.hiding || player.bottles <= 0) return false;
  player.bottles--;
  var m = new THREE.Mesh(bottleGeo, new THREE.MeshStandardMaterial({ color:0xffffff, vertexColors:true, roughness:0.2 }));
  var cp = Math.cos(player.pitch + 0.22), sp = Math.sin(player.pitch + 0.22);
  var fx = -Math.sin(player.viewYaw), fz = -Math.cos(player.viewYaw);
  var t = { mesh:m, x:player.x + fx*0.4, y:player.y - 0.15, z:player.z + fz*0.4,
            vx:fx*cp*THROW_V + player.vx*0.5, vy:sp*THROW_V, vz:fz*cp*THROW_V + player.vz*0.5, spin:0 };
  m.position.set(t.x, t.y, t.z);
  scene.add(m);
  throws.push(t);
  Audio2.click(false);
  return true;
}
function updateThrows(dt){
  for(var i=throws.length-1; i>=0; i--){
    var t = throws[i];
    t.vy -= 9.8 * dt;
    var nx = t.x + t.vx*dt, nz = t.z + t.vz*dt, ny = t.y + t.vy*dt;
    var c = worldToCell(nx, nz);
    var hitWall = !inBounds(c.x, c.y) || world.grid[idx(c.x, c.y)] !== 0;
    if(hitWall || ny <= 0.06 || ny >= WALL_H - 0.1){
      var at = pushOutOfWalls(hitWall ? t.x : nx, hitWall ? t.z : nz, 0.2);
      shatter(at.x, at.z);
      if(t.mesh.parent) t.mesh.parent.remove(t.mesh);
      throws.splice(i, 1);
      continue;
    }
    t.x = nx; t.y = ny; t.z = nz; t.spin += dt * 11;
    t.mesh.position.set(t.x, t.y, t.z);
    t.mesh.rotation.set(t.spin, t.spin*0.6, 0);
  }
}
function shatter(x, z){
  var dx = x - player.x, dz = z - player.z;
  var dist = Math.sqrt(dx*dx + dz*dz);
  var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  var pan = clamp((dx*rx + dz*rz) / Math.max(1, dist), -1, 1);
  Audio2.glass(dist, pan);
  // 追跡者に聞こえたか。壁越しは届きにくい（足音と同じ扱い）
  var hx = x - hunter.x, hz = z - hunter.z, hd = Math.sqrt(hx*hx + hz*hz);
  var dd = DIFF[settings.diff];
  var open = hasSight(world.grid, x, z, hunter.x, hunter.z);
  var reach = dd.hearing * 1.5 * (open ? 1 : 0.7);
  var locked = hunter.mode === 'chase' && hunter.memT > 0;       // 見て追っている最中は釣られない
  if(hd < reach && !locked && !cheats.invisible && hunter.spawnGrace <= 0){
    hunter.mode = 'hunt';
    hunter.lastSeen = { x:x, z:z };
    hunter.repathT = 0; hunter.inspect = null;
    player.lure = (player.lure || 0) + 1;
  }
}

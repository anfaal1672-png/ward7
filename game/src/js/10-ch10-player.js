/* =========================================================================
   10. プレイヤー
   ========================================================================= */
var player = {
  x:0, z:0, y:1.62, yaw:0, pitch:0,
  vx:0, vz:0, hp:100, battery:100, stamina:100, sanity:100,
  lamp:true, running:false, exhausted:false, bob:0, stepAcc:0, breath:0,
  hiding:/** @type {any} */ (null), hideSeen:false, blockedT:0, holdBreath:false, breathBroken:0, breathLock:false, hasKey:false,
  lookBackT:0, viewYaw:0,
  got:0, need:5, time:0, hurtT:0, deadT:0, shake:0, radius:0.42,
  sneaking:false, bottles:0, grabT:0, grabX:0, grabZ:0, wet:false
};

// 家具（円で近似）から押し出す。プレイヤーと追跡者の両方で使う
function pushOutOfSolids(/** @type {number} */ px, /** @type {number} */ pz, /** @type {any} */ R){
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
function pushOutOfWalls(/** @type {number} */ px, /** @type {number} */ pz, /** @type {any} */ R){
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

function collideMove(/** @type {number} */ nx, /** @type {number} */ nz){
  var g = world.grid, R = player.radius;
  function blocked(/** @type {number} */ px, /** @type {number} */ pz){
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
var throws = /** @type {any[]} */ ([]);
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
function updateThrows(/** @type {number} */ dt){
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
function shatter(/** @type {any} */ x, /** @type {any} */ z){
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

/* --- 捕獲と振りほどき（設計指示書 第 5.3・5.5 節） ------------------------
   捕まるたびに一度だけ振りほどける。回数を使い切った状態で捕まると終わり。
   回数は難易度の dmg から決まる（静穏 3 回・通常 2 回・絶望 1 回）。
   これは今までの「4/3/2 発で死亡」とちょうど同じ数で、バランスの測定を
   そのまま引き継げる。内部では体力（hp）をそのまま使い、見せ方だけを
   「あと何回振りほどけるか」に変える。
   包帯を拾うと 1 回分戻る。 */
function escapesLeft(){
  var dmg = DIFF[settings.diff].dmg;
  return Math.max(0, Math.ceil(player.hp / dmg) - 1);
}
function escapesMax(){
  return Math.ceil(100 / DIFF[settings.diff].dmg) - 1;
}
var GRAB_T = 0.7;        // 掴まれている時間。動けず、視線が追跡者へ引かれる
var BANDAGES_PER_RUN = [2, 2, 1];

/* --- 扉をそっと開ける・覗く（設計指示書 第 5.2 節） -----------------------------
   扉：そっと開けている間（DOOR_SLOW 秒）は扉が少しずつ畳まれていき、終わるまで通れない。
   覗く：立ち止まっている間だけ、開けている側へ頭を 0.42m 出す。体はその場に残るので、
   角の向こうを、姿を見せずに（あれの目はこちらの体の位置で見る）確かめられる。 */
var DOOR_SLOW = 1.4;
function updateDoor(/** @type {number} */ dt){
  var L = world.lockDoor;
  if(!L || !L.opening) return;
  L.opening = Math.max(0, L.opening - dt);
  var k = 1 - L.opening / DOOR_SLOW;
  L.group.children.forEach(function(/** @type {any} */ leaf){ leaf.scale.x = Math.max(0.04, 1 - k); });
  if(L.opening <= 0){ L.open = true; L.group.visible = false; L.opening = 0; toast('扉が開いた', 1.6); }
}
var PEEK = { k:0, side:0, want:false };
var PEEK_OUT = 0.42;
function peekSide(){
  // 右と左、どちらに頭を出せるか。壁のすぐ手前なら出せない
  var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  function open(/** @type {any} */ s){
    var x = player.x + rx*s*0.9, z = player.z + rz*s*0.9, c = worldToCell(x, z);
    return inBounds(c.x, c.y) && world.grid[idx(c.x, c.y)] === 0;
  }
  return open(1) ? 1 : (open(-1) ? -1 : 0);
}
function updatePeek(/** @type {number} */ dt){
  var moving = Math.sqrt(player.vx*player.vx + player.vz*player.vz) > 0.3;
  var want = PEEK.want && !moving && !player.hiding && player.grabT <= 0;
  if(want && PEEK.k < 0.05) PEEK.side = peekSide();
  var target = (want && PEEK.side) ? 1 : 0;
  PEEK.k += (target - PEEK.k) * (1 - Math.pow(0.0005, dt));
  if(PEEK.k < 0.002) PEEK.k = 0;
}
/* カメラの位置に足す横ずれ。壁に頭がめり込まないよう押し出す */
function peekOffset(){
  if(PEEK.k <= 0 || !PEEK.side) return null;
  var rx = Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  var px = player.x + rx*PEEK.side*PEEK_OUT*PEEK.k, pz = player.z + rz*PEEK.side*PEEK_OUT*PEEK.k;
  var q = pushOutOfWalls(px, pz, 0.14);
  return { x:q.x - player.x, z:q.z - player.z, roll:-0.10*PEEK.side*PEEK.k };
}

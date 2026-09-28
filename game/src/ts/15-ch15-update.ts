/* =========================================================================
   15. 更新処理
   ========================================================================= */
var _v3 = new THREE.Vector3(), _hv1 = new THREE.Vector3(), _hv2 = new THREE.Vector3();

// ワールド座標をプレイヤー基準の「音量・左右・こもり具合」に変換する
function spatial(wx: any, wz: any, maxD: any, blocked: boolean, refD?: any){
  var dx = wx - player.x, dz = wz - player.z;
  var d = Math.sqrt(dx*dx + dz*dz);
  var n = clamp(d / maxD, 0, 1);
  var ref = refD || 6;                 // 大きいほど遠くまで届く
  var vol = (ref / (ref + d)) * (1 - n*n*n);
  var lat = 0, fwd = 1;
  if(d > 0.01){
    var rvx = Math.cos(player.viewYaw), rvz = -Math.sin(player.viewYaw);
    var fvx = -Math.sin(player.viewYaw), fvz = -Math.cos(player.viewYaw);
    lat = (dx*rvx + dz*rvz) / d;
    fwd = (dx*fvx + dz*fvz) / d;
  }
  if(fwd < 0) vol *= 0.72 + 0.28*(1 + fwd);          // 背後はやや遠く聞こえる
  var cut = 320 + 3200 * Math.pow(1 - n, 2);
  if(blocked){ vol *= 0.5; cut = Math.min(cut, 430); } // 壁越しはこもる
  return { d:d, vol:vol, pan:clamp(lat, -1, 1) * 0.85, cut:cut, fwd:fwd };
}
/* --- 音の通り道（設計指示書 第 10.2 節） ---------------------------------
   壁越しの音を「まっすぐの距離で、こもらせるだけ」にしていたので、
   壁 1 枚向こうで 40m 回り込まないと来られない相手が、すぐ横にいるように
   聞こえていた。プレイヤーのマスから通路を幅優先でたどった距離の地図を
   持ち、壁越しの音はその道のりの長さで小さくし、回り道が長いほどこもらせる。
   向き（左右）は、音が入ってくる開口（こちらのマスの隣の、道の最後の 1 マス）
   から鳴らす。角の向こうの足音は、角の方から聞こえる。 */
var PATHF = { t:0, cx:-1, cy:-1, field:(null as any) };
function updatePathField(dt: number){
  PATHF.t -= dt;
  var c = worldToCell(player.x, player.z);
  if(PATHF.field && PATHF.t > 0 && c.x === PATHF.cx && c.y === PATHF.cy) return;
  PATHF.t = 0.25; PATHF.cx = c.x; PATHF.cy = c.y;
  var g = world.grid, n = GW*GH;
  if(!PATHF.field || PATHF.field.length !== n) PATHF.field = new Int16Array(n);
  var F: any = PATHF.field; F.fill(-1);
  if(!inBounds(c.x, c.y) || g[idx(c.x, c.y)] !== 0) return;
  var q = [idx(c.x, c.y)], head = 0; F[q[0]] = 0;
  while(head < q.length){
    var i = q[head++], x = i % GW, y = (i / GW) | 0, dv = F[i] + 1;
    if(x > 0      && F[i-1]  < 0 && g[i-1]  === 0){ F[i-1]  = dv; q.push(i-1); }
    if(x < GW-1   && F[i+1]  < 0 && g[i+1]  === 0){ F[i+1]  = dv; q.push(i+1); }
    if(y > 0      && F[i-GW] < 0 && g[i-GW] === 0){ F[i-GW] = dv; q.push(i-GW); }
    if(y < GH-1   && F[i+GW] < 0 && g[i+GW] === 0){ F[i+GW] = dv; q.push(i+GW); }
  }
}
function spatialPath(wx: any, wz: any, maxD: any, blocked: boolean, refD?: any){
  if(!blocked || !PATHF.field) return spatial(wx, wz, maxD, blocked, refD);
  var F: any = PATHF.field, c = worldToCell(wx, wz);
  if(!inBounds(c.x, c.y) || F[idx(c.x, c.y)] < 1) return spatial(wx, wz, maxD, blocked, refD);
  // 道を逆にたどって、こちらのマスの隣（道のり 1）まで降りる。そこが開口
  var x = c.x, y = c.y, guard = 200;
  while(F[idx(x, y)] > 1 && guard-- > 0){
    var cur = F[idx(x, y)], nx = x, ny = y;
    if(x > 0    && F[idx(x-1,y)] === cur-1) nx = x-1;
    else if(x < GW-1 && F[idx(x+1,y)] === cur-1) nx = x+1;
    else if(y > 0    && F[idx(x,y-1)] === cur-1) ny = y-1;
    else if(y < GH-1 && F[idx(x,y+1)] === cur-1) ny = y+1;
    else break;
    x = nx; y = ny;
  }
  var pw = cellToWorld(x, y);
  var dx0 = wx - player.x, dz0 = wz - player.z, d = Math.sqrt(dx0*dx0 + dz0*dz0);
  var Lp = Math.max(d, F[idx(c.x, c.y)] * CELL);
  var px = pw.x - player.x, pz = pw.z - player.z, pl = Math.sqrt(px*px + pz*pz) || 1;
  // 開口の向きに、道のりの長さだけ離れた場所で鳴っているものとして計算する
  var r: any = spatial(player.x + px/pl*Lp, player.z + pz/pl*Lp, maxD, false, refD);
  var ex = clamp((Lp - d) / 14, 0, 1);             // 回り道の長さ（14m で頭打ち）
  r.vol *= lerp(0.8, 0.45, ex);
  r.cut = Math.min(r.cut, lerp(1900, 380, ex));
  r.d = d; r.path = Lp;
  return r;
}

/* 床の硬さ。マスの座標から決まる固定値なので、同じ場所は毎回同じ音になる。
   「ここは剥がれたリノリウム、ここはタイル」が歩いているうちに分かる。
   地形の意味は見ていない（部屋か廊下かは音の担当ではない）。 */
function floorMat(x: any, z: any){
  var c = worldToCell(x, z);
  var h = Math.sin(c.x * 127.1 + c.y * 311.7) * 43758.5453;
  return (h - Math.floor(h));
}

var lampFlick = 0, ambientCreakT = 6 + rndFx()*8;
// 残響の切り替えは状態が変わった瞬間だけ。毎フレーム呼ぶと目標値が揺れる
var heartT = 0;

function nearestInteractable(){
  if(player.hiding) return { type:'leave', obj:player.hiding };
  var best = null, bd = 2.0;
  var i, o, dx, dz, d;
  for(i=0;i<world.hides.length;i++){
    o = world.hides[i];
    // 中心からの距離で見るので、どちら側から近づいても反応する
    dx = o.x-player.x; dz = o.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < o.reach && d - o.reach < bd){ bd = d - o.reach; best = { type:'hide', obj:o }; }
  }
  if(world.key && !world.key.taken){
    dx = world.key.x-player.x; dz = world.key.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < bd){ bd = d; best = { type:'key', obj:world.key }; }
  }
  if(world.lever){
    dx = world.lever.x-player.x; dz = world.lever.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < 2.2 && d < bd){ bd = d; best = { type:'lever', obj:world.lever }; }
  }
  if(world.lockDoor && !world.lockDoor.open){
    dx = world.lockDoor.x-player.x; dz = world.lockDoor.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < 2.6 && d < bd){ bd = d; best = { type:'lock', obj:world.lockDoor }; }
  }
  for(i=0;i<world.records.length;i++){
    o = world.records[i]; if(o.taken) continue;
    dx = o.x-player.x; dz = o.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < bd){ bd = d; best = { type:'record', obj:o }; }
  }
  for(i=0;i<world.batteries.length;i++){
    o = world.batteries[i]; if(o.taken) continue;
    dx = o.x-player.x; dz = o.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < bd){ bd = d; best = { type:'battery', obj:o }; }
  }
  if(player.hp < 100){
    for(i=0;i<world.bandages.length;i++){
      o = world.bandages[i]; if(o.taken) continue;
      dx = o.x-player.x; dz = o.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
      if(d < bd){ bd = d; best = { type:'bandage', obj:o }; }
    }
  }
  if(player.bottles < BOTTLE_MAX){
    for(i=0;i<world.bottles.length;i++){
      o = world.bottles[i]; if(o.taken) continue;
      dx = o.x-player.x; dz = o.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
      if(d < bd){ bd = d; best = { type:'bottle', obj:o }; }
    }
  }
  if(world.exit){
    dx = world.exit.x-player.x; dz = world.exit.z-player.z; d = Math.sqrt(dx*dx+dz*dz);
    if(d < 2.4 && (!best || d < bd)) best = { type:'exit', obj:world.exit };
  }
  return best;
}

/* 入力の大きさから速度倍率を出す。1 を超えさせない。
   もとは正規化に使った len をそのまま倍率にも掛けていたため、キーボードで
   斜めに入力すると √2 倍（全力 5.755 → 8.139 m/s、歩き 3.111 → 4.400 m/s）
   出ていた。スティックの入力は大きさが 1 を超えないので、この加速は
   キーボードでしか出ず、モバイル前提のゲームでタッチだけが不利だった。
   追跡者は最速 4.473（絶望でも 5.72）で、5.8 m/s を前提に調整されている。
   自己診断から呼べるように関数に出してある。 */
function moveScale(f: any, s: any){
  var len = Math.sqrt(f*f + s*s);
  return len > 1 ? 1 : len;
}

function updatePlayer(dt: number){
  readKeys(dt);

  // 視点（移動量は腕のスウェイにも使う）
  var swayX = input.lookX * 26, swayY = input.lookY * 26;
  player.yaw   -= input.lookX;
  player.pitch -= input.lookY;
  input.lookX = 0; input.lookY = 0;
  player.pitch = clamp(player.pitch, -1.35, 1.35);

  // 後ろを見る：体の向き（＝進行方向）はそのままに、視線だけ反転させる
  var wantBack = (backBtnDown || pad.back || !!(input.keys.KeyQ || input.keys.KeyC)) && !player.hiding;
  player.lookBackT = lerp(player.lookBackT, wantBack ? 1 : 0, 1 - Math.pow(0.0009, dt));
  if(player.lookBackT < 0.001) player.lookBackT = 0;
  player.viewYaw = player.yaw + player.lookBackT * Math.PI;
  $('bBack').classList.toggle('hot', wantBack);

  // 隠れている間は動けない。視界も狭くなる
  // 返りの深さ：箱の中 / 部屋（大部屋・ホール） / 廊下
  var pcS = worldToCell(player.x, player.z), inRoom = false;
  for(var ri=0; ri<world.rooms.length && !inRoom; ri++){
    var RM = world.rooms[ri];
    if(pcS.x >= RM.x && pcS.x < RM.x + RM.w && pcS.y >= RM.y && pcS.y < RM.y + RM.h) inRoom = true;
  }
  Audio2.setSpace(player.hiding ? 'box' : (inRoom ? 'room' : 'hall'));
  if(player.hiding){
    var H = player.hiding;
    var rel2 = ((player.yaw - H.yaw + Math.PI*3) % TAU) - Math.PI;
    player.yaw = H.yaw + clamp(rel2, -H.span, H.span);
    player.pitch = clamp(player.pitch, -0.7, 0.7);
    player.vx = player.vz = 0;
    player.x = H.x; player.z = H.z;
    // 息を止める：ボタン長押し、またはPCは Shift
    var wantHold = holdBtnDown || pad.hold || !!(input.keys.ShiftLeft || input.keys.ShiftRight);
    if(player.breathLock && player.stamina >= 25) player.breathLock = false;
    player.holdBreath = wantHold && !player.breathLock && player.stamina > 0;
    $('bHold').classList.toggle('hot', player.holdBreath);

    if(player.holdBreath){
      player.stamina = clamp(player.stamina - dt*6.2, 0, 100);
      if(player.stamina <= 0){
        player.holdBreath = false;
        player.breathLock = true;
        player.breathBroken = 1.4;      // 息を吸う音で気づかれる
        Audio2.gasp();
        $('bHold').classList.remove('hot');
      }
    }else{
      player.stamina = clamp(player.stamina + dt*20, 0, 100);
    }
    if(player.breathBroken > 0) player.breathBroken -= dt;
  }

  // 掴まれている間は動けない。視線を追跡者へ引き、終わったら弾かれる
  if(player.grabT > 0){
    player.grabT -= dt;
    var gy = Math.atan2(-(hunter.x - player.x), -(hunter.z - player.z));
    var gdy = ((gy - player.yaw + Math.PI*3) % TAU) - Math.PI;
    player.yaw += gdy * (1 - Math.pow(0.002, dt));
    player.shake = Math.max(player.shake, 0.9);
    input.fwd = 0; input.side = 0; input.run = false;
    if(player.grabT <= 0){
      collideMove(player.x + player.grabX*0.9, player.z + player.grabZ*0.9);
      haptic([40, 30, 60]);
    }
  }

  // 移動
  var f = clamp(input.fwd, -1, 1), s = clamp(input.side, -1, 1);
  var len = moveScale(f, s);
  if(len > 0.0001 && (f*f + s*s) > 1){ var nl = Math.sqrt(f*f + s*s); f/=nl; s/=nl; }
  var moving = len > 0.06;

  // 息切れ状態。0まで使い切ったら、ある程度戻るまで走れない（ON/OFFの往復を防ぐ）
  if(player.stamina <= 0.5 && !player.exhausted){
    player.exhausted = true;
    Audio2.gasp();
    toast('息が切れた', 2);
    $('barSta').classList.add('exh');
  }else if(player.exhausted && player.stamina >= 35){
    player.exhausted = false;
    $('barSta').classList.remove('exh');
  }
  // 壁に押しつけているだけのときは走らない（無駄にスタミナを削らない）
  var wantRun = input.run && f > 0.25 && !player.exhausted && player.blockedT < 0.45;
  player.running = wantRun && moving;
  // 忍び足。PC は Ctrl / Z で抑える。タッチはスティックを小さく倒すだけで同じ速さになる
  if(!player.running && (input.keys.ControlLeft || input.keys.KeyZ || pad.sneak)) len = Math.min(len, SNEAK_LEN);

  var base = 3.111;                 // 2.55 × 1.22（追跡者も同率で引き上げ）
  var speed = base * (player.running ? 1.85 : 1.0);
  player.wet = inWater(player.x, player.z);
  if(player.wet) speed *= 0.86;                 // 膝まで水（第6章）。0.8 ではボットのクリア率が 26% と目標（30〜50%）を割った
  if(cheats.fast) speed *= 2.0;
  if(!player.lamp) speed *= 0.86;              // 暗いと慎重に
  if(player.hp < 40) speed *= 0.9;

  if(cheats.infBreath){
    player.stamina = 100;
  }else if(player.hiding){
    /* 隠れている間の増減は息止め処理側で行う（ここで回復させると相殺されてしまう） */
  }else if(player.running){
    player.stamina = clamp(player.stamina - dt*6.47, 0, 100);
    if(player.stamina <= 0){ player.running = false; }
  }else{
    player.stamina = clamp(player.stamina + dt*(moving ? 26 : 45.5), 0, 100);
  }

  var sy = Math.sin(player.yaw), cy = Math.cos(player.yaw);
  var dirX = (-sy*f + cy*s);
  var dirZ = (-cy*f - sy*s);
  var dl = Math.sqrt(dirX*dirX + dirZ*dirZ);
  if(dl > 0.0001){ dirX/=dl; dirZ/=dl; } else { dirX = dirZ = 0; }

  var tvx = dirX*speed*len, tvz = dirZ*speed*len;
  player.vx = lerp(player.vx, tvx, 1 - Math.pow(0.0015, dt));
  player.vz = lerp(player.vz, tvz, 1 - Math.pow(0.0015, dt));
  var preX = player.x, preZ = player.z;
  if(player.hiding){
    /* 隠れている間は移動しない */
  }else if(cheats.noclip){
    // 壁抜け。ただし病棟の外へは出さない
    var lim = (GW*CELL)/2 - CELL*0.6;
    player.x = clamp(player.x + player.vx*dt, -lim, lim);
    player.z = clamp(player.z + player.vz*dt, -lim, lim);
  }else{
    collideMove(player.x + player.vx*dt, player.z + player.vz*dt);
  }

  // 進もうとした量に対して、実際に進めた量が極端に少なければ「壁に当たっている」
  var wantMove = Math.sqrt(player.vx*player.vx + player.vz*player.vz) * dt;
  var gotMove  = Math.sqrt((player.x-preX)*(player.x-preX) + (player.z-preZ)*(player.z-preZ));
  if(!player.hiding && wantMove > 0.004 && gotMove < wantMove*0.4){
    player.blockedT = Math.min(1, player.blockedT + dt*3.5);
  }else{
    player.blockedT = Math.max(0, player.blockedT - dt*5);
  }

  // 足音・ヘッドボブ
  var vmag = Math.sqrt(player.vx*player.vx + player.vz*player.vz);
  player.sneaking = !player.running && vmag > 0.4 && vmag < SNEAK_V;
  // 歩幅。走ると1歩が大きくなる（速度は変えず、接地の間隔だけ伸びる）
  var stride = player.running ? 1.40 : 1.02;
  if(vmag > 0.4){
    var adv = vmag * dt;
    player.bob += (adv / stride) * Math.PI;      // 1歩でπ進む＝揺れが歩幅に同期する
    player.stepAcc += adv;
    // 余りを繰り越す（0に戻すと1フレーム分だけ歩幅が伸びて不揃いになる）
    if(player.stepAcc >= stride){ player.stepAcc -= stride;
      if(player.wet) Audio2.splash(0, 0, player.sneaking ? 0.35 : (player.running ? 1 : 0.7));
      else Audio2.step(player.running, floorMat(player.x, player.z), player.sneaking ? 0.4 : 1); }
  }else{
    player.bob += dt*0.8;
    if(player.stepAcc > stride*0.6) player.stepAcc = stride*0.6;
  }

  // ランプ
  if(cheats.infLamp){
    player.battery = 100;
  }else if(player.lamp){
    player.battery = clamp(player.battery - dt*DIFF[settings.diff].drain, 0, 100);
    if(player.battery <= 0){
      player.lamp = false; Audio2.click(false);
      $('bLight').classList.remove('hot');
      toast('ランプが消えた', 2.4);
    }
  }

  // 正気度
  var dxh = hunter.x - player.x, dzh = hunter.z - player.z;
  var hd = Math.sqrt(dxh*dxh + dzh*dzh);
  var losRaw = hasLOS(world.grid, player.x, player.z, hunter.x, hunter.z);
  // 壁が抜けていても、間にロッカーが立っていれば姿は見えない。
  // 音は別（ロッカーは壁ではない）なので、壁だけの losRaw も残して使い分ける
  var sightRaw = losRaw && !propBlocksSight(player.x, player.z, hunter.x, hunter.z);
  var visible = hd < 22 && sightRaw;    // 正気度・演出用（距離で頭打ちにする）
  var drainS = 0;
  if(visible && hd < 16) drainS += (16-hd)*0.9;
  if(!player.lamp) drainS += 2.4;
  if(hunter.mode === 'chase') drainS += 7;
  if(cheats.noSanity) player.sanity = 100;
  else player.sanity = clamp(player.sanity + (drainS>0 ? -drainS*dt : dt*3.2), 0, 100);
  if(cheats.regen && player.hp < 100) player.hp = clamp(player.hp + dt*8, 0, 100);

  // インタラクト
  var near = nearestInteractable();
  var reticle = $('reticle'), useBtn = $('bUse');
  if($('bHold').style.display === 'none' && player.hiding) $('bHold').style.display = 'flex';
  if($('bHold').style.display !== 'none' && !player.hiding) $('bHold').style.display = 'none';
  // 停電の章は電源を戻すまで非常口が開かない（第 5 章 CHAPTERS.blackout）
  var dead = world.blackout && !world.power;
  var canUse = !!near && !(near.type==='exit' && (!world.exit.open || dead))
                      && !(near.type==='lock' && !player.hasKey);
  if(near && near.type==='exit' && world.exit.open && dead){
    useBtn.classList.add('dim'); reticle.classList.remove('act');
    useBtn.textContent = '停電';
  }else if(near && near.type==='exit' && !world.exit.open){
    useBtn.classList.add('dim'); reticle.classList.remove('act');
    useBtn.textContent = '施錠';
  }else if(near && near.type==='lock' && !player.hasKey){
    useBtn.classList.add('dim'); reticle.classList.remove('act');
    useBtn.textContent = '鍵';
  }else if(near){
    useBtn.classList.remove('dim'); reticle.classList.add('act');
    useBtn.textContent =
      near.type==='exit'  ? '脱出' :
      near.type==='hide'  ? (near.obj.type==='locker' ? '隠れる' : '潜る') :
      near.type==='leave' ? '出る' :
      near.type==='lever' ? (world.lever.on ? '切る' : '入れる') :
      near.type==='lock'  ? '開ける' : '拾う';
  }else{
    useBtn.classList.add('dim'); reticle.classList.remove('act');
    useBtn.textContent = '拾う';
  }

  if(input.use){
    input.use = false;
    if(near && canUse){
      if(near.type === 'record'){
        near.obj.taken = true;
        near.obj.mesh.visible = false; near.obj.spr.visible = false;
        player.got++;
        $('numGot').textContent = player.got;
        Audio2.pickup();
        haptic(30);
        showNote(player.got - 1);
        if(player.got >= player.need){
          world.exit.open = true;
          world.endgame = true;
          world.exit.door.emissive.setHex(0x2fae86);
          world.exit.sign.color.setHex(0x6fbfa8);
          world.exitLight.color.setHex(0x6fbfa8);
          world.exitLight.intensity = 1.6;
          $('objSub').textContent = (world.blackout && !world.power) ? '電源を戻し、非常口へ' :
                                    (player.hasKey ? '非常口へ走れ' : '鍵を探して非常口へ');
          Audio2.unlock();
          toast('非常口が開いた', 3);
          setTimeout(function(){
            if(state === STATE.PLAY){ Audio2.stinger(); toast('何かが、こちらへ向かっている', 3.4); }
          }, 2600);
        }else{
          toast('カルテ ' + player.got + ' / ' + player.need, 1.8);
        }
      }else if(near.type === 'battery'){
        near.obj.taken = true;
        near.obj.mesh.visible = false; near.obj.spr.visible = false;
        player.battery = 100;                 // 1 個で満タンまで戻る
        Audio2.pickup();
        toast('ランプを満タンにした', 1.8);
      }else if(near.type === 'bandage'){
        near.obj.taken = true;
        near.obj.mesh.visible = false; near.obj.spr.visible = false;
        player.hp = clamp(player.hp + DIFF[settings.diff].dmg, 0, 100);
        Audio2.pickup();
        toast('包帯を巻いた — あと ' + escapesLeft() + ' 回振りほどける', 2.4);
      }else if(near.type === 'bottle'){
        near.obj.taken = true;
        near.obj.mesh.visible = false; near.obj.spr.visible = false;
        player.bottles++;
        Audio2.pickup();
        toast('瓶を拾った（' + player.bottles + '）— 投げると音で気を引ける', 2.4);
      }else if(near.type === 'exit'){
        doWin();
      }else if(near.type === 'key'){
        world.key.taken = true;
        world.key.grp.visible = false; world.key.spr.visible = false;
        player.hasKey = true;
        Audio2.pickup();
        toast('鍵を手に入れた', 2.4);
      }else if(near.type === 'lock' && !world.lockDoor.opening){
        /* 開け方（設計指示書 第 5.2 節）。音と速さの交換：
           走ったまま → 体で押し開ける。すぐ通れるが、大きな音で聞こえる範囲のあれを呼ぶ
           止まって   → そっと開ける。1.4 秒かかる（その間は通れない）が、音はほとんど出ない */
        Audio2.unlock();
        if(input.run || player.running){
          world.lockDoor.open = true;
          world.lockDoor.group.visible = false;
          Audio2.creak(); Audio2.clang(0, 0, 0.9);
          var ldd = Math.sqrt((hunter.x-world.lockDoor.x)*(hunter.x-world.lockDoor.x) + (hunter.z-world.lockDoor.z)*(hunter.z-world.lockDoor.z));
          if(hunter.spawnGrace <= 0 && !cheats.invisible && ldd < DIFF[settings.diff].hearing * 2){
            hunter.lastSeen = { x:world.lockDoor.x, z:world.lockDoor.z };
            if(hunter.mode !== 'chase') hunter.mode = 'hunt';
          }
          toast('扉を押し開けた — 音が響いた', 2.4);
        }else{
          world.lockDoor.opening = DOOR_SLOW;
          toast('扉をそっと開けている…', 1.6);
        }
      }else if(near.type === 'lever'){
        world.lever.on = !world.lever.on;
        world.power = world.lever.on;
        world.lever.handle.rotation.x = world.lever.on ? 0.7 : -0.7;
        world.lever.mat.color.setHex(world.lever.on ? 0x2fae86 : 0x8c2626);
        world.lever.mat.emissive.setHex(world.lever.on ? 0x2fae86 : 0x8c2626);
        Audio2.click(world.lever.on);
        Audio2.creak();
        // 大きな音。近くにいれば気づかれる
        /* 以前は距離を見ずに必ず呼んでいた。第3章（停電）は電源を戻さないと
           出られないので、戻した瞬間に地図の端からでも駆けつけてきて、
           出口までの道で倒れるのが負けの 36% を占めた（通常 14.6%）。
           聴覚の 2.5 倍（通常 32m）より遠くには届かないことにする */
        var lvd = Math.sqrt((hunter.x-world.lever.x)*(hunter.x-world.lever.x) + (hunter.z-world.lever.z)*(hunter.z-world.lever.z));
        if(hunter.spawnGrace <= 0 && !cheats.invisible && lvd < DIFF[settings.diff].hearing * 2.5){
          hunter.lastSeen = { x:world.lever.x, z:world.lever.z };
          if(hunter.mode !== 'chase') hunter.mode = 'hunt';
        }
        toast(world.lever.on ? '電源が入った' : '電源を切った', 2.4);
      }else if(near.type === 'hide'){
        // 入ってきた側を覚えておき、出るときは同じ側へ戻す
        var ax = player.x - near.obj.x, az = player.z - near.obj.z;
        var al = Math.sqrt(ax*ax + az*az);
        if(al < 0.05){ ax = 1; az = 0; al = 1; }
        near.obj.fromX = ax/al; near.obj.fromZ = az/al;
        player.hiding = near.obj;
        near.obj.uses = (near.obj.uses || 0) + 1;     // 追跡者が覚える（第 9 章 learn）
        tele('hide', { x:+near.obj.x.toFixed(1), z:+near.obj.z.toFixed(1), uses:near.obj.uses });
        player.vx = player.vz = 0;
        player.yaw = near.obj.yaw;
        // 入るところを見られていたら、隠れても意味がない
        player.hideSeen = false;
        hunter.memT = 0;        // 姿を消したので、完璧な追尾はここで途切れる
        if(hunter.group && hunter.group.visible && hunter.spawnGrace <= 0 && !cheats.invisible){
          var hdx = hunter.x - player.x, hdz = hunter.z - player.z;
          var hdd = Math.sqrt(hdx*hdx + hdz*hdz);
          if(hdd < DIFF[settings.diff].sight &&
             hasSight(world.grid, player.x, player.z, hunter.x, hunter.z)){
            if(!cheats.ghostHide && !settings.safeHide) player.hideSeen = true;
            hunter.lastSeen = { x:near.obj.x, z:near.obj.z };
            if(hunter.mode !== 'chase') hunter.mode = 'hunt';
            toast('見られた', 2.6);
          }
        }
        $('hideView').classList.toggle('on', near.obj.type === 'locker');
        $('bHold').style.display = 'flex';
        Audio2.step(false, floorMat(player.x, player.z));
        toast(near.obj.type === 'locker' ? 'ロッカーに隠れた' :
              (near.obj.type === 'desk' ? '机の下に潜り込んだ' : 'ベッドの下に潜り込んだ'), 2.4);
      }else if(near.type === 'leave'){
        var H2 = near.obj;
        var ox2 = (H2.fromX !== undefined) ? H2.fromX : 1;
        var oz2 = (H2.fromZ !== undefined) ? H2.fromZ : 0;
        var outP = pushOutOfSolids(H2.x + ox2*H2.outDist, H2.z + oz2*H2.outDist, player.radius);
        outP = pushOutOfWalls(outP.x, outP.z, player.radius);
        player.x = outP.x; player.z = outP.z;
        player.hiding = null; player.holdBreath = false; player.hideSeen = false;
        $('hideView').classList.remove('on');
        $('bHold').style.display = 'none';
        $('bHold').classList.remove('hot');
      }
    }
  }

  // カメラ
  var spd01 = clamp(vmag/3.0, 0, 1);
  // 画面の揺れ（設定・第 13 章）。0 で頭の揺れも被弾の揺れも止まる
  var MO = settings.motion;
  var bobY = Math.sin(player.bob*2) * (player.running ? 0.052 : 0.028) * spd01 * MO;
  var bobX = Math.cos(player.bob)   * (player.running ? 0.040 : 0.022) * spd01 * MO;
  var panic = 1 - player.sanity/100;
  player.shake = Math.max(0, player.shake - dt*2.2);
  var sh = (player.shake * 0.06 + panic*0.012) * MO;

  /* 追う側で遊んでいるときは、このカメラは使わない（第21章が追跡者の頭に置く）。
     ランプもカメラの子なので消し、代わりに逃げる側の分身が世界の中で灯す。 */
  if(playAs === 'hunter'){
    flashlight.intensity = 0;
    playerLight.intensity = 0;
    if(viewArm) viewArm.visible = false;
    ambient.intensity = (AMB_BASE - panic*0.14) * (world.power ? 1.7 : 1) * (cheats.brightWorld ? 4.2 : 1);
    updateAvatar(dt, spd01);
    return { hd:hd, visible:visible, los:losRaw, sight:sightRaw, vmag:vmag };
  }

  var eyeY = player.hiding ? player.hiding.camY : player.y;
  camera.position.set(
    player.x + (player.hiding ? 0 : bobX) + (Math.random()-0.5)*sh,
    eyeY + (player.hiding ? 0 : bobY) + (Math.random()-0.5)*sh,
    player.z + (Math.random()-0.5)*sh
  );
  camera.rotation.set(player.pitch, player.viewYaw,
    Math.sin(player.bob) * (player.running ? 0.019 : 0.010) * spd01 * MO + (Math.random()-0.5)*sh*0.4);
  // 覗く（第 10 章 updatePeek）。頭だけを横へ出す
  updatePeek(dt);
  var pk = peekOffset();
  if(pk){ camera.position.x += pk.x; camera.position.z += pk.z; camera.rotation.z += pk.roll; }

  // ランプの明かり
  var flickAmt = player.battery < 22 ? (0.45 + 0.55*Math.abs(Math.sin(performance.now()*0.017))) : 1;
  // 点滅の強さ（設定）。0 では揺れず、弱った明るさのまま灯る
  if(flickAmt < 1) flickAmt = lerp(0.72, flickAmt, settings.flash);

  // --- 一人称の腕 ---
  if(viewArm){
    var vt = performance.now()*0.001;
    // 視点の動きに少し遅れて追従させる（重さを出す）
    viewSway.tx = clamp(-player.yaw * 0, -1, 1);
    viewSway.x = lerp(viewSway.x, clamp(swayX, -1, 1), 1 - Math.pow(0.02, dt));
    viewSway.y = lerp(viewSway.y, clamp(swayY, -1, 1), 1 - Math.pow(0.02, dt));

    var bAmp = player.running ? 1.0 : 0.45;
    var vx = Math.cos(player.bob) * 0.016 * bAmp * spd01 - viewSway.x * 0.045;
    var vy = Math.sin(player.bob*2) * 0.014 * bAmp * spd01 - viewSway.y * 0.040
             + Math.sin(vt*1.4) * 0.0035;                       // 呼吸
    var vz = (player.running ? 0.045 : 0) * spd01;               // 走ると引き寄せる

    /* 扉をそっと開けている間は、手を前へ出して扉を押す（第 9.4 節「扉に手を掛ける」） */
    var doorW = (world.lockDoor && world.lockDoor.opening > 0) ? 1 : 0;
    HANDL.door += (doorW - HANDL.door) * (1 - Math.pow(0.004, dt));
    vz -= 0.07 * HANDL.door; vy += 0.025 * HANDL.door;
    viewArm.position.set(vx, vy, vz);
    viewArm.rotation.set(
      -viewSway.y * 0.10 + Math.sin(player.bob*2) * 0.020 * bAmp * spd01 + (player.running ? 0.10 : 0),
      -viewSway.x * 0.13,
       viewSway.x * 0.09 + Math.sin(player.bob) * 0.026 * bAmp * spd01 + (player.running ? -0.14 : 0)
    );
    // 腕の傾きぶんだけ光軸をずらす（光が腕と一緒に揺れる）
    viewBeam.x = -Math.sin(viewArm.rotation.y) * 0.85;
    viewBeam.y =  Math.sin(viewArm.rotation.x) * 0.85;
    flashlight.position.set(vx * 0.8 + 0.05, vy * 0.8 - 0.02, 0);
    playerLight.position.set(vx * 0.5, vy * 0.5, 0);

    // レンズの発光はランプの状態に連動
    viewParts.lens.emissiveIntensity = player.lamp ? 2.4*flickAmt : 0.04;
    viewParts.lens.color.setRGB(1, 0.94, 0.82);
    /* 手を照らしている光もランプ由来なので、一緒に消す。消したときに
       残るのは後ろ上からの縁の光と環境光だけになり、手が沈む。 */
    var lampK = player.lamp ? flickAmt : 0.06;
    viewParts.keyLight.intensity = viewParts.keyI * lampK;
    viewParts.bounceLight.intensity = viewParts.bounceI * lampK;
    // 尾部の通電表示。消灯中も完全には消さない（電池が生きていることは分かる）
    /* 色は線形で渡るので、消灯時の (0.28,0.04,0.10) は画面では
       ピンクに見えていた。線形で暗い値まで落とす。 */
    if(viewParts.led) viewParts.led.color.setRGB(player.lamp ? 1 : 0.045,
                                                 player.lamp ? 0.16*flickAmt : 0.004, 0.012);
    viewArm.visible = !player.hiding;
  }
  // 口を押さえる左手。上がるのは素早く、下ろすのはゆっくり
  if(viewHandL){
    var wantM = (player.hiding && player.holdBreath) ? 1 : 0;
    HANDL.k += (wantM - HANDL.k) * (1 - Math.pow(wantM ? 0.0004 : 0.02, dt));
    var hk = HANDL.k, he = 1 - (1-hk)*(1-hk);
    var tr = player.stamina < 30 ? (30 - player.stamina) / 30 * 0.004 : 0;     // 苦しくなると震える
    viewHandL.visible = hk > 0.01;
    /* 自分の口を覆う手は、目からは下の縁に人差し指の側が横たわって見えるだけ。
       左下から上がってきて、指を右へ向けて画面の下の方に収まる */
    viewHandL.position.set(lerp(-0.16, -0.005, he) + (Math.random()-0.5)*tr,
                           lerp(-0.30, -0.100, he) + (Math.random()-0.5)*tr, lerp(-0.2, -0.17, he));
    viewHandL.rotation.set(lerp(0.3, -0.18, he), lerp(0.3, 0.12, he), lerp(-0.6, -1.45, he));
  }
  flashlight.intensity = player.lamp ? LAMP_I*flickAmt : 0;
  playerLight.intensity = player.lamp ? PLIGHT_I*flickAmt : 0.14;
  ambient.intensity = (AMB_BASE - panic*0.14) * (world.power ? 1.7 : 1);
  updateExposure(dt, player.lamp ? flickAmt : 0);

  return { hd:hd, visible:visible, los:losRaw, sight:sightRaw, vmag:vmag };
}

/* ---- 自動露出（明順応） ----
   実物の懐中電灯は、白い壁を 1.5m から照らせば 1000 lux を超える。
   人の目はそこで絞るので白飛びしては見えないが、露出を固定した画面は
   そのまま飛ぶ。実測：追跡者に 1.5m まで寄られると体の平均輝度が
   背景の 1.32 倍まで上がり、皮膚のテクスチャが白一色に潰れていた。
   逆に、電池を切って真っ暗な廊下に立つと、目なら数秒で慣れるはずの
   明るさが最後まで見えないままだった。

   画面を読み返して測る（readPixels）のが正攻法だが、GPU の処理待ちを
   起こすのでモバイルでは払いたくない。代わりに「ビームが何にどれだけ
   近くで当たるか」を幾何から見積もる。減衰は distance^-1.65 と
   自分で決めた値なので、当たる距離さえ分かれば返る光の量は計算できる。
   壁・床・天井・追跡者・什器の 5 つを見て、いちばん近いものを採る。 */
/* 基準の戻り光。ここに合わせたときだけ倍率 1 になる。
   値そのものより「ふつうの廊下で今までの明るさが保たれるか」が判定基準で、
   実測から 2.9m の壁を照らしている状態に決めた（0.59＝3.5m 相当だと
   画面平均が 64.5 → 58.1 まで落ちた）。
   直値で持つとランプの強さを変えるたびに画面全体が明るさごと動くので、
   LAMP_I から作る。実際、絞ったぶん 4.0 → 5.0 に上げたとき、
   ここが 0.80 のままで画面平均が 58.6 → 48.3 まで落ちた。 */
var EXP_REF = 0.10 + LAMP_I/Math.pow(2.9, 1.65);
var EXP_LO = 0.62, EXP_HI = 1.25;   // 絞りの下限・上限
/* ビームが最初に当たる面までの距離と、その面への入射の深さ。
   距離だけでは足りない。同じ 4m でも、正面の壁に垂直に当たれば
   全光量がそのまま返り、床を浅い角度でなでるだけならほとんど返らない。
   実測：正面の壁を 4m から照らすと画面が白飛びしていたのに、露出は
   むしろ開いていた（距離が遠いぶん暗いはずだと見積もっていた）。
   結果は BEAM に書く（毎フレーム呼ぶので入れ物は使い回す）。 */
var BEAM = { d:14, ndl:1 };
function beamHitDist(){
  var cp = Math.cos(player.pitch), sp = Math.sin(player.pitch);
  var fx = -Math.sin(player.viewYaw)*cp, fy = sp, fz = -Math.cos(player.viewYaw)*cp;
  var eyeY = camera.position.y, d = 14, ndl = 1;
  // 床と天井。ビームの中心が当たる距離は三角形で出る。入射の深さは |fy|
  if(fy < -0.05){ d = eyeY / -fy; ndl = -fy; }
  else if(fy > 0.05){ d = (WALL_H - eyeY) / fy; ndl = fy; }
  if(d > 14){ d = 14; ndl = 1; }
  /* 壁。0.35m ずつ進めて最初の壁マスを探す（40 回で 14m）。
     どちらの軸をまたいで入ったかで面の向きが決まる。 */
  var g = world.grid, pc = worldToCell(player.x, player.z);
  for(var s=0.35; s<d; s+=0.35){
    var c = worldToCell(player.x + fx*s, player.z + fz*s);
    if(!inBounds(c.x, c.y) || g[idx(c.x, c.y)] !== 0){
      d = s;
      ndl = (c.x !== pc.x) ? Math.abs(fx) : Math.abs(fz);
      break;
    }
    pc = c;
  }
  /* 追跡者と什器。ビームの中にいるものだけを見る。円錐の外にあるものは
     照らされていないので、寄られても露出を変えてはいけない。
     こちらを向いた物なので入射は正面（1）とみなす。 */
  var COSB = Math.cos(LAMP_ANG);
  function consider(px: number, py: any, pz: number, rad: any){
    var vx = px - player.x, vy = py - eyeY, vz = pz - player.z;
    var L = Math.sqrt(vx*vx + vy*vy + vz*vz);
    if(L < 0.2 || L >= d) return;
    if((vx*fx + vy*fy + vz*fz)/L < COSB) return;
    d = Math.max(0.4, L - rad); ndl = 1;
  }
  if(hunter.group && hunter.group.visible) consider(hunter.x, 1.15, hunter.z, 0.25);
  var pr = world.props;
  for(var i=0; i<pr.length; i++) consider(pr[i].x, pr[i].h*0.5, pr[i].z, pr[i].r);
  BEAM.d = d; BEAM.ndl = clamp(ndl, 0.05, 1);
  return d;
}
function updateExposure(dt: number, lampOn: any){
  var d = Math.max(0.55, beamHitDist());
  // 環境光ぶんの下駄。電源が入っている区画は天井灯があるので底上げする
  var ret = 0.10 * (world.power ? 1.7 : 1) +
            (LAMP_I*lampOn) * BEAM.ndl / Math.pow(d, 1.65);
  /* 指数。0.32 では近づいたときの絞りが足りず、追跡者に 2m まで
     寄られると体が白く飛んだ（実測 平均輝度 120.7・背景の 1.23 倍）。
     0.44 にすると同じ場面で倍率が 0.78 → 0.71 になる。遠い側は
     どのみち上限で頭打ちなので、ここを上げても暗い廊下は変わらない。 */
  var k = clamp(Math.pow(EXP_REF/ret, 0.44), EXP_LO, EXP_HI);
  /* 順応の速さは方向で違う。まぶしくなったときの縮瞳は 0.2 秒ほどで
     終わるが、暗さに慣れるのは何秒もかかる。同じ速さにすると、
     壁からぱっと離れた瞬間に画面全体が持ち上がって不自然に見える。 */
  var tau = (k < expAdapt) ? 0.22 : 1.10;
  expAdapt += (k - expAdapt) * (1 - Math.exp(-dt/tau));
  renderer.toneMappingExposure = exposureNow();
}

function avoidProps(x: any, z: any, dx: number, dz: number, look: any, rad: any){
  var pr = world.props, bestT = 1e9, hit = null;
  for(var i=0; i<pr.length; i++){
    var o = pr[i], ox = o.x - x, oz = o.z - z;
    var t = ox*dx + oz*dz;                       // 進む向きに沿った距離
    if(t <= 0 || t > look) continue;             // 目標より先（点検するロッカーなど）は避けない
    var px = ox - dx*t, pz = oz - dz*t;          // 進路からの横のずれ
    var R = o.r + rad;
    if(px*px + pz*pz >= R*R) continue;
    if(t < bestT){ bestT = t; hit = { o:o, px:px, pz:pz, R:R }; }
  }
  if(!hit) return null;
  // 什器の中心と反対の側へ、円の縁をかすめる向きに曲げる
  var side = (hit.px*dz - hit.pz*dx) > 0 ? 1 : -1;   // 什器の無い側へ抜ける（+z 側に什器→ -z へ）
  var o2 = hit.o, cx = o2.x - x, cz = o2.z - z, d2 = Math.sqrt(cx*cx + cz*cz);
  if(d2 < 1e-4) return null;
  var ang = Math.asin(Math.min(1, hit.R / d2));
  var base = Math.atan2(cz, cx) + side * ang;
  return { x:Math.cos(base), z:Math.sin(base) };
}

function updateHunter(dt: number, info: any){
  var g = world.grid;
  var hd = info.hd;
  // 通気口（第 9 章）。天井裏にいる間は、見ることも襲うこともない
  if(hunter.ventCd > 0) hunter.ventCd -= dt;
  if(playAs !== 'hunter' && ventUpdate(dt)){ Audio2.setTension(0.2); return; }

  if(hunter.spawnGrace > 0) hunter.spawnGrace -= dt;

  // 知覚
  var toX = player.x - hunter.x, toZ = player.z - hunter.z;
  var los = info.los;                   // 壁だけの視線。聴覚の減衰に使う
  var canSee = info.sight;              // 壁＋背の高い什器。目視判定に使う
  var d = DIFF[settings.diff];
  // 忍び足は立ち止まっているのとほぼ同じだけしか聞こえない（第 10 章 SNEAK_V）
  var noise = player.running ? 1.6 : (info.vmag > 0.4 ? (player.sneaking ? 0.55 : 1.0) : 0.45);
  // 水の中では足音が水しぶきになって遠くまで届く（忍び足なら半分で済む）
  if(player.wet && info.vmag > 0.4) noise *= player.sneaking ? 1.2 : 1.4;
  var hearOpen = d.hearing * noise;     // 見通せるときの聴覚距離
  var hearWall = hearOpen * 0.55;       // 壁越しは届きにくいが、届く
  var seen = false;                     // 目視した＝追跡
  var heard = false;                    // 物音だけ＝音のした場所へ向かう
  if(hunter.spawnGrace <= 0){
    var nl = Math.max(0.0001, Math.sqrt(toX*toX + toZ*toZ));
    if(canSee && hd < d.sight){
      var fw = Math.sin(hunter.yaw), fz = Math.cos(hunter.yaw);
      var dot = (toX/nl)*fw + (toZ/nl)*fz;
      if(dot > 0.05 || hd < 6) seen = true;
    }
    // ランプで照らすと視野の外からでも見つかる。
    // ここは sight の距離ゲートの外に出す（内側だと sight+6 が効かない）
    if(canSee && player.lamp && !cheats.noLampTell && hd < d.sight + 6){
      var pfx = -Math.sin(player.viewYaw), pfz = -Math.cos(player.viewYaw);
      // toX,toZ は「追跡者→プレイヤー」なので、符号を反転して
      // 「プレイヤーが追跡者の方を向いているか」を見る（従来は逆だった）
      var pdot = -((toX/nl)*pfx + (toZ/nl)*pfz);
      if(pdot > 0.86) seen = true;
    }
    if(!cheats.silent && hd < (los ? hearOpen : hearWall)) heard = true;
    if(hd < 3.2) seen = true;
  }
  // 隠れている間：明かりが漏れれば見つかる。息を止めていれば気配を消せる
  if(player.hiding && !player.hideSeen){
    seen = false; heard = false;
    // ここは canSee ではなく los のまま。隠れているプレイヤーの座標は
    // ロッカー自身の位置なので、canSee だと自分が入った箱に遮られて
    // 「明かりが漏れて見つかる」が永久に成立しなくなる
    if(player.lamp && los && hd < d.sight) seen = true;
    else if((!player.holdBreath || player.breathBroken > 0) && hd < 3.2) heard = true;
    if((!player.holdBreath || player.breathBroken > 0) && hd < 1.5) seen = true;
  }
  // 入るところを見られていた場合は、隠れても普通に見つかる
  if(cheats.invisible){ seen = false; heard = false; }

  // 全て集めた後は、姿が見えていなくても居場所を嗅ぎつけて向かってくる
  /* 停電の章では、電源を戻すまでは嗅ぎつけない。全部集めてから電源へ回り、
     さらに非常口まで走る長い道のりを、ずっと居場所を知られたまま歩かせていた
     （第3章の負けの 37% が「出口へ」）。電源を戻した瞬間から追ってくる */
  if(world.endgame && (!world.blackout || world.power) &&
     hunter.spawnGrace <= 0 && !cheats.invisible && !cheats.blindEnd && !seen){
    hunter.lastSeen = { x:player.x, z:player.z };
    if(hunter.mode !== 'chase') hunter.mode = 'hunt';
  }

  if(cheats.invisible){ hunter.memT = 0; hunter.lastSeen = null; }
  hunter.memT = Math.max(0, hunter.memT - dt);

  if(seen){
    hunter.mode = 'chase';
    hunter.lastSeen = { x:player.x, z:player.z };
    hunter.memT = cheats.shortMem ? 0.25 : d.memory;   // 見失っても数秒は完全に追尾する
  }else if(hunter.memT > 0 && !(player.hiding && !player.hideSeen)){
    hunter.mode = 'chase';
    hunter.lastSeen = { x:player.x, z:player.z };
  }else{
    if(hunter.mode === 'chase') hunter.mode = 'hunt';   // 見失ったら最後の位置へ
    if(heard){
      // 姿は見ていない。音のした場所へ向かうだけで、まだ襲ってはこない
      hunter.mode = 'hunt';
      hunter.lastSeen = { x:player.x, z:player.z };
    }
  }
  if(hunter.mode === 'hunt'){
    if(hunter.lastSeen){
      var lx = hunter.x - hunter.lastSeen.x, lz = hunter.z - hunter.lastSeen.z;
      if(Math.sqrt(lx*lx + lz*lz) < 1.5){
        // 到着しても近くにいれば嗅ぎつけ直す
        // seen を経由させる（隠れて見つかっていない相手を、距離だけで再捕捉しない）
        if(seen){ hunter.mode = 'chase'; hunter.memT = d.memory * 0.6; hunter.inspect = null; }
        else if(hunter.inspect){
          /* 点検。扉を開け、ベッドの下を覗く。ここに居れば見つかる。
             居なければ、この場所は空だったと覚え直す */
          hunter.inspectT += dt;
          if(hunter.inspectT >= HIDE_CHECK_T){
            var ins = hunter.inspect;
            Audio2.creak();
            if(player.hiding === ins && !cheats.invisible && !cheats.ghostHide){
              player.hideSeen = true;
              hunter.mode = 'chase'; hunter.memT = d.memory;
              hunter.lastSeen = { x:player.x, z:player.z };
              toast('見つかった', 2.2);
            }else{
              ins.uses = 0;
              hunter.mode = 'patrol'; hunter.lastSeen = null;
            }
            hunter.inspect = null; hunter.inspectT = 0;
          }
        }else{
          /* 見失った場所の近くに、何度も使われた隠れ場所があれば点検しに行く。
             こちらが中に居るかどうかは知らない。使われた回数だけを見ている */
          var insP = null, insD = 5.0;
          for(var ih=0; ih<world.hides.length; ih++){
            var H0 = world.hides[ih];
            if((H0.uses || 0) < d.learn) continue;
            var idx0 = H0.x - hunter.lastSeen.x, idz0 = H0.z - hunter.lastSeen.z;
            var idd = Math.sqrt(idx0*idx0 + idz0*idz0);
            if(idd < insD){ insD = idd; insP = H0; }
          }
          if(insP && !cheats.invisible && !settings.safeHide){
            hunter.inspect = insP; hunter.inspectT = 0;
            hunter.lastSeen = { x:insP.x, z:insP.z };
          }else{
            hunter.mode = 'patrol'; hunter.lastSeen = null;
          }
        }
      }
    }else{
      hunter.mode = 'patrol';
    }
  }
  if(hunter.mode === 'chase') hunter.chaseT += dt; else hunter.chaseT = 0;
  if(playAs !== 'hunter' && ventTryEnter()) return;
  if(hunter.mode !== 'hunt'){ hunter.inspect = null; hunter.inspectT = 0; }
  // 演出の頭脳：出会っていない時間と、追跡が終わってからの時間
  if(hunter.mode === 'patrol') DIRECTOR.calmT += dt; else DIRECTOR.calmT = 0;
  if(hunter.mode === 'chase') DIRECTOR.sinceChaseT = 0; else DIRECTOR.sinceChaseT += dt;

  var moved = 0;
  if(playAs === 'hunter'){
    // 追う側は人間が動かす。経路探索と自動移動はまるごと使わない
    moved = moveHunterByInput(dt);
  }else{
  // 目的地
  hunter.repathT -= dt;
  var hc = worldToCell(hunter.x, hunter.z);
  hc.x = clamp(hc.x, 1, GW-2); hc.y = clamp(hc.y, 1, GH-2);
  if(g[idx(hc.x,hc.y)] !== 0){
    // 万一壁に埋まったときは、瞬間移動させず最寄りの通路へ「歩いて」抜ける
    var found = null;
    for(var rr=1; rr<4 && !found; rr++){
      for(var oy=-rr; oy<=rr && !found; oy++) for(var ox=-rr; ox<=rr && !found; ox++){
        var nx=hc.x+ox, ny=hc.y+oy;
        if(inBounds(nx,ny) && g[idx(nx,ny)]===0) found = {x:nx,y:ny};
      }
    }
    if(found){
      var fw2 = cellToWorld(found.x, found.y);
      var ex = fw2.x - hunter.x, ez = fw2.z - hunter.z;
      var el = Math.sqrt(ex*ex + ez*ez) || 1;
      var estep = Math.min(el, hunter.speed * 2.2 * dt);
      hunter.x += ex/el * estep;
      hunter.z += ez/el * estep;
      hc = worldToCell(hunter.x, hunter.z);
      hc.x = clamp(hc.x, 1, GW-2); hc.y = clamp(hc.y, 1, GH-2);
    }
  }

  // 視線が通っているときは経路探索を使わずまっすぐ突っ込む。
  // （同じマスに入ると BFS が次の一歩を返せず、目の前で立ち止まってしまうため）
  if(hunter.noDirectT > 0) hunter.noDirectT -= dt;
  // 視線判定は壁しか見ていないので、机やドラム缶越しにプレイヤーが見える。
  // 「見えている」のは正しいが、そのまま直進すると什器に突っ込んで止まる。
  // 直進してよいかは什器も含めて別に判定する。
  var laneClear = true;
  if(los){
    var ldx = player.x - hunter.x, ldz = player.z - hunter.z;
    var lseg = Math.sqrt(ldx*ldx + ldz*ldz);
    var steps = Math.min(24, Math.max(2, Math.ceil(lseg / 0.45)));
    for(var li=1; li<=steps && laneClear; li++){
      var lt = li/steps;
      var lx2 = hunter.x + ldx*lt, lz2 = hunter.z + ldz*lt;
      for(var lp=0; lp<world.props.length; lp++){
        var op = world.props[lp];
        var pdx = lx2 - op.x, pdz = lz2 - op.z, prr = op.r + 0.34;
        if(pdx*pdx + pdz*pdz < prr*prr){ laneClear = false; break; }
      }
    }
  }
  // 引っかかった直後は直進追跡を止め、経路探索に戻して回り込ませる
  var directChase = (hunter.mode === 'chase' && los && laneClear && hunter.noDirectT <= 0);
  if(directChase){
    hunter.target = { x:player.x, z:player.z };
    hunter.repathT = 0;
  }else if(hunter.repathT <= 0 || !hunter.target){
    hunter.repathT = (hunter.mode === 'chase') ? 0.22 : 0.6;
    var goal;
    if(hunter.mode === 'chase'){
      goal = worldToCell(player.x, player.z);
    }else if(hunter.mode === 'hunt' && hunter.lastSeen){
      goal = worldToCell(hunter.lastSeen.x, hunter.lastSeen.z);
    }else{
      hunter.patrolT -= dt;
      if(!hunter.patrolGoal || hunter.patrolT <= 0){
        var reach = buildInfo.reach;
        // 徘徊は完全ランダム。プレイヤーの位置は一切参照せず、
        // 到達可能なマスから一様に選ぶ（＝どこへ向かうか読めない）
        // 什器で埋まったマスを目的地にしない（着けないので張り付いてしまう）
        var navP = world.nav;
        var pick = null, want = directorWant();
        var pcD = worldToCell(player.x, player.z);
        for(var pt=0; pt<(want ? 30 : 12); pt++){
          var cand3 = reach[(rndAI()*reach.length)|0];
          if(navP && navP[idx(cand3.x, cand3.y)] !== 0) continue;
          if(want){
            var mdD = Math.abs(cand3.x - pcD.x) + Math.abs(cand3.y - pcD.y);
            if(want > 0 && (mdD < DIRECTOR_NEAR[0] || mdD > DIRECTOR_NEAR[1])) continue;
            if(want < 0 && mdD < DIRECTOR_AWAY) continue;
          }
          pick = cand3; break;
        }
        if(want > 0 && pick) DIRECTOR.calmT = 0;          // 寄せるのは一度に一回。次はまた calm を待つ
        hunter.patrolGoal = pick || reach[(rndAI()*reach.length)|0];
        hunter.patrolT = 4.5 + rndAI()*4;
      }
      goal = { x:hunter.patrolGoal.x, y:hunter.patrolGoal.y };
    }
    goal = { x:clamp(goal.x, 0, GW-1), y:clamp(goal.y, 0, GH-1) };
    if(!inBounds(goal.x,goal.y) || g[idx(goal.x,goal.y)] !== 0){
      goal = hunter.patrolGoal || hc;
    }
    // 経路は什器込みのグリッドで引く。塞がったマスへ突っ込まなくなる
    var navG = world.nav || g;
    // 追跡者自身が塞がったマスの上にいる場合だけ、素の迷路で一歩だけ逃がす
    var navG2 = (navG[idx(hc.x,hc.y)] !== 0) ? g : navG;
    if(navG2[idx(goal.x,goal.y)] !== 0){
      // 目的地が什器で埋まっているなら、その手前の通れるマスを目指す
      var alt = null, bestAd = 1e9;
      for(var ai=0; ai<4; ai++){
        var ax = goal.x + (ai===0?1:ai===1?-1:0), ay = goal.y + (ai===2?1:ai===3?-1:0);
        if(inBounds(ax,ay) && navG2[idx(ax,ay)] === 0){
          var ad = Math.abs(ax-hc.x) + Math.abs(ay-hc.y);
          if(ad < bestAd){ bestAd = ad; alt = {x:ax, y:ay}; }
        }
      }
      if(alt) goal = alt;
    }
    var nstep = bfsNextStep(navG2, hc.x, hc.y, goal.x, goal.y);
    if(nstep){
      var nsw = cellToWorld(nstep.x, nstep.y);
      hunter.target = { x:nsw.x, z:nsw.z };
    }else if(hunter.mode === 'chase' || hunter.mode === 'hunt'){
      // 経路が引けなくても追跡中は直進を試みる（立ち止まり防止）
      hunter.target = { x:player.x, z:player.z };
    }else{
      hunter.target = null;
      hunter.patrolGoal = null;
    }
  }

  // 移動
  if(hunter.target){
    var dx = hunter.target.x - hunter.x, dz = hunter.target.z - hunter.z;
    var dist = Math.sqrt(dx*dx+dz*dz);
    if(dist < (directChase ? 0.8 : 0.12)){
      if(!directChase){ hunter.target = null; hunter.repathT = 0; }
    }else{
      var rage = Math.min(d.rage, hunter.chaseT * 0.09);   // 追跡が続くほど加速する
      var spd = (cheats.slowHunter ? 0.5 : 1) *
                hunter.speed * (hunter.mode==='chase' ? d.chaseMul : (hunter.mode==='hunt'?1.05:0.82))
                + (hunter.mode==='chase' ? rage : 0);
      if(inWater(hunter.x, hunter.z)) spd *= 0.85;      // あれも水には足を取られる
      var nx0 = dx/dist, nz0 = dz/dist;               // 目標への単位ベクトル
      /* 什器を先に避ける。ぶつかってから押し戻され、壁沿いに滑って抜ける、では
         ベッドや棚の多い部屋でいちいち詰まる（部屋を作り込んだら追跡が目に見えて
         弱くなった：ボットのクリア率 41→50%）。進む先 2.4m 以内で、体の幅を足した円に
         掛かる什器があれば、その横をかすめる向きへ前もって舵を切る */
      var av = avoidProps(hunter.x, hunter.z, nx0, nz0, Math.min(dist, 2.4), 0.36);
      if(av){ nx0 = av.x; nz0 = av.z; }
      // 曲がり角の減速（第 9 章 CORNER_SLOW）。追跡中だけ効かせる
      var turnC = 1 - (nx0*hunter.dirX + nz0*hunter.dirZ);   // 0 直進 / 1 直角 / 2 反転
      if(hunter.mode === 'chase' && turnC > 0.25) hunter.cornerK = Math.max(hunter.cornerK, clamp(turnC, 0, 1));
      hunter.dirX = nx0; hunter.dirZ = nz0;
      spd *= 1 - CORNER_SLOW * hunter.cornerK;
      hunter.cornerK = Math.max(0, hunter.cornerK - dt / CORNER_REC);
      var mv = (cheats.freeze || hunter.stunT > 0 || hunter.swingT > 0 || hunter.inspect && hunter.inspectT > 0)
               ? 0 : Math.min(dist, spd*dt);
      var beforeX = hunter.x, beforeZ = hunter.z;
      hunter.x += nx0*mv; hunter.z += nz0*mv;
      // 直進追跡でも壁をすり抜けないよう毎フレーム押し戻す
      var fix = pushOutOfWalls(hunter.x, hunter.z, 0.34);
      hunter.x = fix.x; hunter.z = fix.z;
      fix = pushOutOfSolids(hunter.x, hunter.z, 0.30);   // 什器にもぶつかる
      hunter.x = fix.x; hunter.z = fix.z;
      moved = Math.sqrt((hunter.x-beforeX)*(hunter.x-beforeX) + (hunter.z-beforeZ)*(hunter.z-beforeZ));

      // --- 引っかかりの検出と回避 ---
      // 押し戻しで前進が打ち消されると、壁や什器に体をこすりつけたまま
      // 止まってしまう。進めていない状態が続いたら壁沿いに滑って迂回する。
      if(mv > 0.0005 && moved < mv*0.45){
        hunter.stuckT += dt;
        if(hunter.slideDir === 0) hunter.slideDir = (rndAI() < 0.5) ? -1 : 1;
      }else{
        hunter.stuckT = Math.max(0, hunter.stuckT - dt*2.2);
        if(hunter.stuckT <= 0) hunter.slideDir = 0;
      }

      if(hunter.stuckT > 0.12){
        // 目標方向と直角に滑る。左右どちらへ逃がすかは詰まった時点で決めておく
        var tanX = -nz0 * hunter.slideDir, tanZ = nx0 * hunter.slideDir;
        var slide = mv * 1.0;
        var sx2 = hunter.x + tanX*slide, sz2 = hunter.z + tanZ*slide;
        var sfix = pushOutOfWalls(sx2, sz2, 0.34);
        sfix = pushOutOfSolids(sfix.x, sfix.z, 0.30);
        var sgot = Math.sqrt((sfix.x-hunter.x)*(sfix.x-hunter.x) + (sfix.z-hunter.z)*(sfix.z-hunter.z));
        if(sgot > moved){
          hunter.x = sfix.x; hunter.z = sfix.z;
          moved = sgot;
        }else{
          // その向きも塞がっていた。次のフレームは逆側を試す
          hunter.slideDir = -hunter.slideDir;
        }
      }

      if(hunter.stuckT > 0.85){
        // 滑っても抜けられない＝直線では回り込めない位置関係。
        // 直進追跡をいったん諦めて経路探索に戻す
        hunter.stuckT = 0;
        hunter.slideDir = 0;
        hunter.noDirectT = 1.2;
        hunter.target = null;
        hunter.repathT = 0;
        if(hunter.mode === 'patrol') hunter.patrolGoal = null;
      }
      var wantYaw = Math.atan2(dx, dz);
      var diff = ((wantYaw - hunter.yaw + Math.PI*3) % TAU) - Math.PI;
      hunter.yaw += diff * Math.min(1, dt*6);
      // 体がまだ向いていない残りの角度。姿勢側で首を先に送るのに使う
      hunter.turnLead = diff;
    }
  }
  if(!isFinite(hunter.x) || !isFinite(hunter.z)){
    var safe = cellToWorld(1,1); hunter.x = safe.x; hunter.z = safe.z;
  }

  // 姿勢アニメ
  }   // ← playAs === 'hunter' の分岐ここまで

  var P = hunter.parts;
  var chasing = (hunter.mode === 'chase');
  var now = performance.now() * 0.001;
  // 足音の間隔（chase 0.95m / それ以外 1.5m）と脚の運びを一致させる
  var hStride = (hunter.mode === 'chase') ? 0.95 : 1.5;
  hunter.bob += (moved / hStride) * Math.PI;
  var sw = Math.sin(hunter.bob), cw = Math.cos(hunter.bob);
  /* 歩容の位相。0 が踵接地。腕も脚もここから引くので、いちばん先に出す。 */
  var ph = hunter.bob / TAU;
  // 歩き 0 ／ 走り 1。姿勢の切り替わりはすべてこの 1 本で送る
  hunter.gaitRun = lerp(hunter.gaitRun, chasing ? 1 : 0, 1 - Math.pow(0.02, dt));
  var rk = hunter.gaitRun;
  /* 歩容の効き。止まっているときは表を引かない（その場で脚が動くと
     床の上を滑って見える）。
     ただし速度に線形で掛けていたのが間違いだった。追跡者の巡航は
     3.5m/s なので 1.2 で割ると常に 1 に張り付く一方、歩き出しの
     0〜0.5 秒は 0.1〜0.4 のあいだをうろつき、踏み出しの一歩目だけが
     半分の振り幅になる（歩き出しがスローモーションに見えていた）。
     しきい値を下げて 0.65m/s で全開にし、S 字で入れる。さらに速度の
     フレーム毎のばらつきを時定数 0.09 秒で均す（押し戻しで速度が
     跳ねるたびに脚の振り幅がちらついていた）。 */
  var spdNow = moved / Math.max(1e-5, dt);
  var wantW = clamp((spdNow - 0.15) / 0.50, 0, 1);
  wantW = wantW*wantW*(3 - 2*wantW);
  hunter.walkK = lerp(hunter.walkK, wantW, 1 - Math.pow(0.004, dt));
  var walkK = hunter.walkK;
  /* 股関節の角度。腕（対側の脚と組む）が先に使うので、脚より前で出す。
     ここを脚の側に置いたまま腕から参照したら、var の巻き上げで
     undefined を掛けることになり、腕の回転が NaN になって画面から
     消えていた（実測：reach は 1.15 まで正しく送られているのに
     armL.up.rotation.x が NaN）。 */
  /* 歩容の表は逆関節の脚のときに書いたもので、前後が裏返っている（位相 0〜0.6 で足が
     体の後ろから前へ動く＝床に着いた足が前へ滑る。実測で接地した足が体の 1.8 倍の速さで動いていた）。
     人の脚に替えたので、腿・膝・足首とも符号を反転して前後を鏡に写す。これで位相 0 が踵接地、
     0〜0.6 が立脚（足が前から後ろへ送られる）、膝は人の向きに曲がる。腕は脚の値を使うので一緒に直る */
  var hipL  = -gaitMix(GAIT_HIP_W,  GAIT_HIP_R,  ph,     rk) * walkK;
  var hipR  = -gaitMix(GAIT_HIP_W,  GAIT_HIP_R,  ph+0.5, rk) * walkK;

  hunter.twitchT -= dt;
  if(hunter.twitchT <= 0){
    hunter.twitchT = chasing ? (0.25 + rndFx()*0.4) : (0.7 + rndFx()*1.6);
    hunter.twitch = (rndFx()-0.5) * (chasing ? 0.5 : 0.28);
  }
  hunter.twitch *= Math.pow(0.02, dt);

  // コマ落ちのような一瞬の破綻。数秒に一度、姿勢が飛ぶ
  hunter.glitchT -= dt;
  if(hunter.glitchT <= 0){
    hunter.glitchT = (chasing ? 1.6 : 3.4) + rndFx()*4.5;
    hunter.glitch = 1;
  }
  hunter.glitch = Math.max(0, hunter.glitch - dt*8);
  var gl = hunter.glitch;

  hunter.jawOpen = lerp(hunter.jawOpen, chasing ? 1 : 0.08, 1 - Math.pow(0.05, dt));
  P.jaw.rotation.x = hunter.jawOpen * 0.95 + Math.abs(sw) * 0.05;   // 人の可動域を超えて開く

  /* 前傾。chasing の真偽で切り替えると、追跡に入った 1 フレームで
     上体が 10 度飛ぶ。歩容と同じ係数で送る。 */
  /* 前傾。追跡でも 0.42rad（24 度）にしかならず、走りに見えなかった。
     背骨は腰から上だけを傾けるので、同じ角度でも見た目の傾きは小さい。
     走りの成分を 0.18 → 0.34 に上げ、全開で 0.58（33 度）まで倒す。
     歩きの 0.24 は据え置き（歩いている相手が前のめりだと落ち着かない）。 */
  var lean = 0.24 + 0.34*hunter.gaitRun;
  P.spine.rotation.x = lean + Math.sin(hunter.bob*0.5)*0.03;
  P.spine.rotation.z = Math.sin(now*0.79)*0.035;
  P.spine.scale.y = 1 + Math.sin(now*1.21 + Math.sin(now*0.43)*2)*0.024;  // 呼吸ではない伸縮
  P.spine.position.y = P.baseY - lean*0.18;   // 上下の揺れは歩容側で足す

  // 首が伸びる。頭は縮尺を打ち消して大きさを保つ
  var stretch = 1 + (chasing ? 0.34 : 0.06) * (0.5 + 0.5*Math.sin(now*0.63));
  P.neck.scale.y = lerp(P.neck.scale.y, stretch, 1 - Math.pow(0.2, dt));
  P.head.scale.y = 1 / P.neck.scale.y;

  // 頭の向き。追いかけている間だけこちらを見据え、
  // それ以外は自分の周囲を見回している（常時こちらを向いていると
  // 「見つかっている／いない」の差が消えて、覗き見る怖さが無くなる）
  var toPl = Math.atan2(player.x - hunter.x, player.z - hunter.z);
  var rel = ((toPl - hunter.yaw + Math.PI*3) % TAU) - Math.PI;

  hunter.gazeT -= dt;
  if(hunter.gazeT <= 0){
    if(chasing){
      // 追跡中もときどき視線がずれる。完全な機械にはしない
      hunter.gazeT = 0.5 + rndFx()*1.1;
      hunter.gazeTarget = (rndFx() < 0.78) ? 0 : (rndFx()-0.5)*0.9;
    }else{
      hunter.gazeT = 0.9 + rndFx()*2.2;
      // 徘徊中は進行方向を中心に左右を流し見る。
      // まれに（気配を感じたように）こちらを一瞥する
      var glance = (hunter.mode === 'hunt') ? 0.30 : 0.12;
      hunter.gazeTarget = (rndFx() < glance) ? clamp(rel, -1.5, 1.5)
                                           : (rndFx()-0.5) * 2.0;
    }
  }
  var wantHead;
  if(chasing){
    wantHead = clamp(rel + hunter.gazeTarget, -1.5, 1.5);
  }else{
    wantHead = clamp(hunter.gazeTarget, -1.5, 1.5);
  }
  /* 曲がるとき、首が体より先に行き先を向く。
     人は首 → 肩 → 腰の順に回る。体の向き（hunter.yaw）は時定数 0.17 秒で
     追従しているので、その「まだ回りきっていない残り角」をそのまま首に
     足せば、頭が先に曲がって体が追いかける形になる。
     曲がり終われば残り角は 0 に落ちるので、直進中は何も足さない。 */
  var lead = clamp(hunter.turnLead || 0, -1.2, 1.2) * 0.55;
  // 見回しはゆっくり、捕捉したときだけ素早く首が回る
  var headK = chasing ? 0.08 : 0.55;
  P.head.rotation.y = lerp(P.head.rotation.y, wantHead + lead, 1 - Math.pow(headK, dt));
  /* 頭は傾いた背骨を打ち消して水平に保つ（標的から目を離さない）。
     ただし 1.15 倍では打ち消しすぎて顔が上を向き、せっかくの前傾が
     消えて見えた。0.86 倍にすると首から上だけがわずかに前へ残る。 */
  P.head.rotation.x = -lean*0.86 + Math.sin(now*0.71)*0.06;
  P.head.rotation.z = Math.sin(now*0.61)*0.24 + hunter.twitch + (rndFx()-0.5)*1.1*gl;

  // 瞳：片方だけ勝手に泳ぎ、ときどき両方消える
  /* 基準の位置は人体の模型に替えると顔に合わせて動く（hunterSkin）。定数で書いていたら
     右目だけが手続きの頭の位置へ戻り、模型の眼窩が空いて見えた */
  P.pupR.position.x = P.pupRBase.x + Math.sin(now*0.53)*0.016*P.pupRBase.s;
  P.pupR.position.y = P.pupRBase.y + Math.sin(now*0.37)*0.008*P.pupRBase.s;
  hunter.eyeT -= dt;
  if(hunter.eyeT <= 0){ hunter.eyeT = 1.8 + rndFx()*4; hunter.eyeOff = 0.18 + rndFx()*0.25; }
  hunter.eyeOff = Math.max(0, hunter.eyeOff - dt);
  var baseLit = chasing ? 1 : (hunter.mode === 'hunt' ? 0.62 : 0.40);
  var pulse = chasing ? (0.82 + 0.18*Math.sin(now*7.5)) : (0.86 + 0.14*Math.sin(now*2.1));
  var lit = hunter.eyeOff > 0 ? 0 : baseLit * pulse;
  P.eyeMatL.color.setRGB(lit, lit*0.10, lit*0.05);
  P.eyeMatR.color.setRGB(lit, lit*0.10, lit*0.05);
  P.glowL.material.opacity = lit * 0.95;
  var gs = 0.26 + lit * 0.16;
  P.glowL.scale.set(gs, gs, 1); P.glowR.scale.set(gs, gs, 1);

  // 腕：追跡中は即応、それ以外は本体から遅れて動く（人形のように）
  var reachOut = chasing ? 1.15 : 0.15;
  var lagK = 1 - Math.pow(chasing ? 0.002 : 0.4, dt);
  /* 腕は対側の脚と組む（左腕は右脚と一緒に前へ出る）。
     sw を使っていたときは脚と 4 分の 1 周期ずれていて、走っているのに
     腕と脚の組が合っていなかった。歩容と同じ位相から引く。 */
  /* 振りと構えを分ける。
     これまで「振り＋構え」をまとめて時定数 1.1 秒の lerp に通していたので、
     1 歩 0.6 秒の振りが平均化されて消えていた（実測 ±0.03 rad ＝ 2 度で、
     歩いているのに腕が体側に貼り付いて見えた）。
     構え（追跡中に前へ突き出す量）だけを遅らせ、振りはそのまま入れる。 */
  hunter.reach = lerp(hunter.reach, reachOut, lagK);
  var swA = hipR, swB = hipL;   // 腕は対側の脚と組む（脚と同じ値をそのまま使う）
  P.armL.up.rotation.x = swA*0.62 - hunter.reach + (rndFx()-0.5)*1.3*gl;
  P.armR.up.rotation.x = swB*0.62 - hunter.reach + (rndFx()-0.5)*1.3*gl;
  P.armL.up.rotation.z =  0.16 + (chasing?0.1:0) + hunter.twitch*0.3;
  P.armR.up.rotation.z = -0.16 - (chasing?0.1:0) - hunter.twitch*0.3;
  /* 肘。追跡中は -0.25rad（14 度）とほぼ伸び切っており、腕を前へ突き出した
     まま棒のように走っていた。走る人の肘はおよそ 60 度に畳まれ、腕の振りに
     合わせて伸び縮みする。歩きの垂らし方は据え置き。 */
  var elbW = -0.5 - Math.abs(sw)*0.3;
  var elbL = elbW + (-1.05 - elbW + Math.abs(swA)*0.28) * hunter.gaitRun;
  var elbR = elbW + (-1.05 - elbW + Math.abs(swB)*0.28) * hunter.gaitRun;
  P.armL.fore.rotation.x = lerp(P.armL.fore.rotation.x, elbL, lagK);
  P.armR.fore.rotation.x = lerp(P.armR.fore.rotation.x, elbR, lagK);
  /* 手の形。走って追いかけているあいだは獲物へ伸ばした鉤爪、
     歩いているあいだは力の抜けた半握り。丸め違いの手を 2 体作って
     見せ分ける（指に関節を足すと左右で 30 個増える）。
     切り替えは gaitRun の中ほどで、走り出しの姿勢が変わる瞬間と揃う。 */
  var claw = hunter.gaitRun > 0.5;
  if(P.armL.open){
    P.armL.open.visible = P.armR.open.visible = claw;
    P.armL.curl.visible = P.armR.curl.visible = !claw;
  }
  P.armL.hand.rotation.x = Math.sin(now*4.3)*0.3;
  P.armR.hand.rotation.x = Math.sin(now*4.3 + 1.7)*0.3;

  /* 脚。位相 0 が踵接地。右脚は半周期ずらす。
     移動していないときは表を引かず、立ち姿勢へ寄せる（その場で
     脚だけが動き続けると、床の上を滑っているように見える）。 */
  var kneL  = -gaitMix(GAIT_KNEE_W, GAIT_KNEE_R, ph,     rk) * walkK + 0.10;
  var kneR  = -gaitMix(GAIT_KNEE_W, GAIT_KNEE_R, ph+0.5, rk) * walkK + 0.10;
  var ankL  = -gaitMix(GAIT_ANK_W,  GAIT_ANK_R,  ph,     rk) * walkK;
  var ankR  = -gaitMix(GAIT_ANK_W,  GAIT_ANK_R,  ph+0.5, rk) * walkK;
  /* 立ち姿。歩容の表は止まると全部 0 に落ちるので、両足を揃えた棒立ちに
     なっていた。人は片脚に体重を預け、反対の腰が下がり、片足がやや前へ
     出る。止まっているぶん（1-walkK）だけその形へ寄せ、ごくゆっくり
     重心を移す（同じ姿勢で固まっていると、それはそれで人形に見える）。 */
  var idle = 1 - walkK;
  var shift = Math.sin(now*0.31) * 0.5 + 0.5;            // 0..1 をゆっくり往復
  hipL -= idle * (0.13 - 0.18*shift);
  hipR -= idle * (-0.05 + 0.18*shift);
  kneL -= idle * (-0.04 - 0.10*(1-shift));
  kneR -= idle * (-0.04 - 0.10*shift);
  P.legL.thigh.rotation.x = hipL;
  P.legR.thigh.rotation.x = hipR;
  P.legL.shin.rotation.x  = kneL;
  P.legR.shin.rotation.x  = kneR;
  // 足首。ここが動くだけで「地面を蹴っている」が出る
  if(P.legL.foot) P.legL.foot.rotation.x = ankL;
  if(P.legR.foot) P.legR.foot.rotation.x = ankR;
  /* 骨盤。体重が片脚に乗るたび、遊脚側の腰が落ちて上体が傾く。
     上下は 1 歩に 1 回ではなく 2 回（両脚支持でいちばん低い）。 */
  var pelvis = -(0.5 + 0.5*Math.cos(ph*2*TAU)) * (0.030 + 0.022*rk) * walkK;
  var list   = Math.sin(ph*TAU) * (0.048 + 0.027*rk) * walkK
             + idle * (0.030 - 0.060*shift);            // 体重を預けた側へ腰が落ちる
  /* 接地の当たり。踵が着く一瞬だけ体を沈めると、初めて体重が出る。
     位相 0 と 0.5 に鋭い山を立てる（8 乗で幅を絞る）。 */
  var strike = Math.pow(Math.max(0, Math.cos(ph*2*TAU)), 8) * (0.014 + 0.012*rk) * walkK;
  P.spine.position.y += pelvis - strike;
  P.spine.rotation.z += list;
  /* 曲がるときに体を内側へ倒す。
     走って角を曲がる人は、遠心力に釣り合うぶんだけ内側へ傾く。傾かずに
     向きだけ変わると、体が軸に刺さって回っているように見える。

     駆動値に turnLead（体がまだ向いていない残り角）を使うと効かない。
     yaw は diff * min(1, dt*6) で追従するので残り角はほぼ常に 0 で、
     旋回撮影リグで測っても 0.01 しか出なかった。実際の角速度を持つ。

     傾きは物理どおり atan(v·ω/g) を目安にする。v=5.7m/s・ω=1rad/s なら
     0.58rad になるが、人はそこまで倒さない（足で支える）ので 0.38 倍。
     0.24rad（14 度）で頭打ち。 */
  var yprev = (hunter.yawPrev === undefined) ? hunter.yaw : hunter.yawPrev;
  hunter.yawPrev = hunter.yaw;
  var dy = ((hunter.yaw - yprev + Math.PI*3) % TAU) - Math.PI;
  var yrate = dy / Math.max(dt, 1e-4);
  hunter.yawRate = lerp(hunter.yawRate || 0, yrate, 1 - Math.pow(0.03, dt));
  var spd = moved / Math.max(dt, 1e-4);
  var bank = clamp(hunter.yawRate * spd / 9.8 * 0.38, -0.24, 0.24) * walkK;
  P.spine.rotation.z += bank;
  hunter.bank = bank;
  P.spine.rotation.y += Math.sin(ph*TAU) * (0.06 + 0.04*rk) * walkK;   // 骨盤のひねり

  /* 病衣の裾は髪より重い。遅れを大きく、戻りを鈍くする。
     歩幅（sw）に合わせて前後へ振れ、走ると後ろへ流れる。 */
  if(P.gown){
    var gsw = sw*0.34 + (chasing ? 0.22 : 0);
    for(var gj=0; gj<P.gown.length; gj++){
      var gp = P.gown[gj];
      var want = gsw*Math.cos(gp.rotation.y) + Math.sin(now*0.8 + gj*1.7)*0.09;
      gp.rotation.x = lerp(gp.rotation.x, want, 1 - Math.pow(0.55, dt));
    }
  }

  // 髪束は本体より遅れて揺れる
  for(var ti=0; ti<P.strands.length; ti++){
    var st = P.strands[ti];
    st.rotation.x = lerp(st.rotation.x, 0.1 - sw*0.16 + Math.sin(now*1.3 + ti)*0.10, 1 - Math.pow(0.25, dt));
    st.rotation.z = lerp(st.rotation.z, Math.sin(now*0.9 + ti*2.1)*0.17, 1 - Math.pow(0.25, dt));
  }

  // 表面の明るさが定まらない＝光を当てても像が結ばない
  /* 0.40〜0.70 は自己発光が強すぎて、光を当てなくても白く浮いていた。
     暗闇でうっすら見える程度（0.10〜0.18）に落とす。 */
  P.skin.emissiveIntensity = 0.10 + 0.08*Math.abs(Math.sin(now*3.3 + Math.sin(now*8.1)*1.5))
                             + (chasing ? 0.04 : 0);

  // --- 殴打 ---
  // 片腕だけを使う。肘をたたんで引き、腰の回転で肩を送り出し、
  // 一気に肘を伸ばして正面へ突き出す。反対の腕は逆に引いて釣り合いを取る。
  // 腕の骨は下向き（-Y）なので、up.rotation.x = -PI/2 でちょうど正面を指す。
  if(hunter.swingT > 0){
    var sK = 1 - clamp(hunter.swingT / SWING_DUR, 0, 1);   // 0→1

    var wind, hit;
    if(sK < 0.34){
      wind = sK / 0.34;                    // 引き（ためる）
      wind = wind*wind*(3 - 2*wind);
      hit  = 0;
    }else if(sK < 0.52){
      wind = 1;
      hit  = (sK - 0.34) / 0.18;           // 打ち抜き（最速区間）
      hit  = hit*hit;                      // 加速感を出す
    }else{
      wind = 1;
      hit  = 1;
      var back = (sK - 0.52) / 0.48;       // 戻し
      back = back*back*(3 - 2*back);
      wind *= (1 - back);
      hit  *= (1 - back);
    }

    var A  = (hunter.punchArm > 0) ? P.armR : P.armL;   // 突き出す腕
    var B  = (hunter.punchArm > 0) ? P.armL : P.armR;   // 引く腕
    var sg = hunter.punchArm;                            // 右=+1 / 左=-1

    // 腰と肩の回転。ためで開き、打つ瞬間に一気に閉じる
    // rotation.y は毎フレーム再代入されない軸なので、必ず絶対値で入れる
    // （加算にすると殴るたびに腰のひねりが溜まっていく）
    P.spine.rotation.y = sg*(0.34*wind - 0.52*hit);
    P.spine.rotation.x += -0.12*wind + 0.30*hit;

    // 打つ腕は基準姿勢に足すのではなく、目標の角度そのものへ寄せる。
    // 加算にすると徘徊時と追跡時で基準が違うぶん振り上げすぎになり、
    // 肩の上まで腕が回ってフックのようになってしまう。
    // 骨は -Y 向きなので up.rotation.x = -PI/2 でちょうど正面を指す。
    var UP_WIND = -0.30, UP_HIT = -1.62;    // 引く：やや後ろ／打つ：ほぼ水平の正面
    var FO_WIND = -2.10, FO_HIT = -0.06;    // 肘：たたみ切る／伸ばし切る
    A.up.rotation.x   = lerp(lerp(A.up.rotation.x, UP_WIND, wind), UP_HIT, hit);
    A.fore.rotation.x = lerp(lerp(A.fore.rotation.x, FO_WIND, wind), FO_HIT, hit);
    A.up.rotation.z  += sg*(0.42*wind - 0.34*hit);
    A.hand.rotation.x = -0.35*wind + 0.30*hit;   // 拳を握り込んで手首を返す

    // 引く腕：反対方向へ。上体のひねりが読み取れるようにする
    B.up.rotation.x   +=  0.34*wind + 0.30*hit;
    B.up.rotation.z   -= sg*(0.20*wind + 0.16*hit);
    B.fore.rotation.x += -0.55*wind - 0.65*hit;

    /* 脚で打つ。腕だけを振っていたので、上体も脚も棒立ちのまま拳が
       前へ出るだけだった。実際の打撃は後脚で床を蹴り、前膝が曲がって
       体重が前へ乗る。踏み込みと沈み込みを足す。
       前へ出るのは打つ腕と反対の脚（対側）。 */
    var fL = (hunter.punchArm > 0) ? P.legL : P.legR;   // 踏み込む脚
    var bL = (hunter.punchArm > 0) ? P.legR : P.legL;   // 蹴る脚
    var step = wind*0.28 + hit*1.0;
    fL.thigh.rotation.x += step*0.38;
    fL.shin.rotation.x  -= step*0.34;
    bL.thigh.rotation.x -= step*0.30;
    bL.shin.rotation.x  -= step*0.12;
    if(fL.foot) fL.foot.rotation.x += step*0.18;
    if(bL.foot) bL.foot.rotation.x -= step*0.30;        // 後脚は爪先で蹴る
    P.spine.position.y -= step*0.055;                   // 沈み込む
    // 頭は打つ側の肩越しに、標的を見据えたまま
    P.head.rotation.y += -sg*(0.30*wind - 0.42*hit);

    /* 踏み込み。ここまで殴打は腰から上だけで、脚は歩容の表を引いたまま
       だった。人が殴るときに力を出しているのは後ろ脚の蹴りと前脚の
       突っ張りで、上半身はそれを伝えているにすぎない。下が無いので、
       腕だけが宙で振れて体重が乗らなかった。
       打つ腕と反対の脚を前に出す（右で殴るなら左足を踏み込む）。 */
    var LEAD = (hunter.punchArm > 0) ? P.legL : P.legR;
    var REAR = (hunter.punchArm > 0) ? P.legR : P.legL;
    // ため：重心を後ろへ預け、後ろ膝をたたむ
    // 打ち：前脚を出して着き、後ろ脚は蹴って伸び切る
    LEAD.thigh.rotation.x = lerp(lerp(LEAD.thigh.rotation.x,  0.30, wind),  0.62, hit);
    LEAD.shin.rotation.x  = lerp(lerp(LEAD.shin.rotation.x,  -0.55, wind), -0.18, hit);
    REAR.thigh.rotation.x = lerp(lerp(REAR.thigh.rotation.x, -0.10, wind), -0.52, hit);
    REAR.shin.rotation.x  = lerp(lerp(REAR.shin.rotation.x,  -0.60, wind), -0.30, hit);
    if(LEAD.foot) LEAD.foot.rotation.x = lerp(lerp(LEAD.foot.rotation.x,  0.10, wind),  0.02, hit);
    if(REAR.foot) REAR.foot.rotation.x = lerp(lerp(REAR.foot.rotation.x, -0.05, wind), -0.45, hit);
    // 沈み込み。踏み込んだぶん腰が落ちる
    P.spine.position.y -= 0.020*wind + 0.052*hit;
    P.head.rotation.x += -0.16*wind + 0.22*hit;
    P.jaw.rotation.x = Math.max(P.jaw.rotation.x, 0.55*wind + 0.95*hit);
  }else{
    P.spine.rotation.y = 0;
  }
  // 攻撃直後の硬直：のけぞって固まる。
  // 殴打モーションの再生中は動かさない（打撃の姿勢と喧嘩するため）
  if(hunter.stunT > 0 && hunter.swingT <= 0){
    var stunK = clamp(hunter.stunT / 0.85, 0, 1);
    // 0.5 ではのけぞりが強すぎ、胴が後ろへ折れて見えた
    P.spine.rotation.x -= stunK * 0.28;
    P.head.rotation.x  -= stunK * 0.45;
    // 突き出した腕が伸びきったまま垂れ、もう一方は遅れて落ちる。
    // 基準姿勢から引くと、打ち抜いた直後の腕（up.x≒-1.62）がさらに
    // 持ち上がって頭上（-2.77rad）で固まっていた。骨は -Y 向きなので
    // rotation.x≒0 が「垂れている」。そこへ寄せる。
    var SA = (hunter.punchArm > 0) ? P.armR : P.armL;
    var SB = (hunter.punchArm > 0) ? P.armL : P.armR;
    SA.up.rotation.x   = lerp(SA.up.rotation.x,   0.14,  stunK);
    SA.fore.rotation.x = lerp(SA.fore.rotation.x, -0.28, stunK);
    SB.up.rotation.x   = lerp(SB.up.rotation.x,   0.14,  stunK*0.7);
    SB.fore.rotation.x = lerp(SB.fore.rotation.x, -0.28, stunK*0.7);
    SA.up.rotation.z += hunter.punchArm * stunK * 0.30;
    SB.up.rotation.z -= hunter.punchArm * stunK * 0.42;
    P.jaw.rotation.x = Math.max(P.jaw.rotation.x, stunK * 1.0);
    P.neck.scale.y = lerp(P.neck.scale.y, 1 + stunK*0.45, 0.5);
    P.head.scale.y = 1 / P.neck.scale.y;
  }

  /* 止まっているときの所作（設計指示書 第 9.2 節の動きの一覧）。どれも既存の状態から引く見た目だけの層で、
     位置・判定・乱数には触れない（時刻の正弦だけで揺らす）。
     - 点検：ロッカーは扉へ手を伸ばし、ベッド・机は上体を折って下を覗き込む
     - 探索中に立ち止まったら、首を大きく傾けて聞く／顔を上げて短く嗅ぐ、を交互に
     - 徘徊中の待機は 3 通り（揺れて立つ・首を垂れる・首を回して指を握り込む）を 6 秒ごとに */
  var MO = P.motion || (P.motion = { ins:0, bend:0, listen:0, sniff:0, idle:[0, 0, 0] });
  var inspecting = !!(hunter.inspect && hunter.inspectT > 0);
  var low = inspecting && hunter.inspect.type !== 'locker';
  MO.ins = lerp(MO.ins, inspecting && !low ? 1 : 0, 1 - Math.pow(0.01, dt));
  MO.bend = lerp(MO.bend, low ? 1 : 0, 1 - Math.pow(0.01, dt));
  var still = 1 - walkK;
  var searching = hunter.mode === 'hunt' && !inspecting;
  var sniffing = Math.sin(now*0.45) > 0.2;
  MO.listen = lerp(MO.listen, searching && !sniffing ? still : 0, 1 - Math.pow(0.03, dt));
  MO.sniff = lerp(MO.sniff, searching && sniffing ? still : 0, 1 - Math.pow(0.03, dt));
  var idleSlot = Math.floor(now / 6) % 3;
  for(var iv=0; iv<3; iv++)
    MO.idle[iv] = lerp(MO.idle[iv], hunter.mode === 'patrol' && iv === idleSlot ? still : 0, 1 - Math.pow(0.1, dt));
  if(MO.ins > 0.01){                      // ロッカーの扉へ右手を伸ばす
    P.armR.up.rotation.x = lerp(P.armR.up.rotation.x, -1.30, MO.ins);
    P.armR.up.rotation.z = lerp(P.armR.up.rotation.z, 0.10, MO.ins);
    P.armR.fore.rotation.x = lerp(P.armR.fore.rotation.x, -0.35, MO.ins);
    P.head.rotation.z += 0.32*MO.ins;
    P.head.rotation.y *= 1 - MO.ins;
  }
  if(MO.bend > 0.01){                     // ベッド・机の下を覗く
    P.spine.rotation.x += 0.95*MO.bend;
    P.head.rotation.x -= 0.55*MO.bend;    // 顔は下ではなく奥（隙間の中）を向く
    P.head.rotation.z += 0.45*MO.bend;
    [P.armL, P.armR].forEach(function(A: any, ai: number){
      A.up.rotation.x = lerp(A.up.rotation.x, -0.55 - 0.15*ai, MO.bend);
      A.fore.rotation.x = lerp(A.fore.rotation.x, -0.20, MO.bend);
    });
  }
  if(MO.listen > 0.01){                   // 首を大きく傾けて、音のした方へ耳を向ける
    P.head.rotation.z += 0.55*MO.listen;
    P.head.rotation.x += 0.12*MO.listen;
    P.spine.rotation.z += 0.08*MO.listen;
  }
  if(MO.sniff > 0.01){                    // 顔を上げ、短く何度も吸い込む
    var burst = Math.max(0, Math.sin(now*1.7)) * Math.max(0, Math.sin(now*15));
    P.head.rotation.x -= (0.38 + 0.07*burst)*MO.sniff;
    P.spine.rotation.x -= 0.10*MO.sniff;
  }
  if(MO.idle[1] > 0.01){                  // 首を垂れて立ち尽くす
    P.head.rotation.x += 0.55*MO.idle[1];
    P.spine.rotation.x += 0.12*MO.idle[1];
  }
  if(MO.idle[2] > 0.01){                  // ゆっくり首を回し、指を握り込む
    P.head.rotation.y += Math.sin(now*0.9)*0.9*MO.idle[2];
    P.head.rotation.z += Math.sin(now*0.9 + 1.2)*0.25*MO.idle[2];
  }

  /* 人体の模型（第 9.1 節）の指。手続きの体は丸め違いの手を 2 体持って見せ分けていたが、
     模型は指の付け根と中ほどの 2 段を実際に曲げる。走るときは獲物へ伸ばし、歩くときは半握り */
  if(P.human){
    var ck = claw ? 0.12 : 0.75 + 0.55*MO.idle[2]*(0.5 + 0.5*Math.sin(now*1.3));
    [P.armL, P.armR].forEach(function(A: any){
      A.curlK = lerp(A.curlK, ck, 1 - Math.pow(0.02, dt));
      A.fingP.quaternion.setFromAxisAngle(A.curlAx, A.curlK*0.85);
      A.fingD.quaternion.setFromAxisAngle(A.curlAx, A.curlK*1.05);
    });
    hunterLOD(Math.hypot(hunter.x - camera.position.x, hunter.z - camera.position.z));
  }

  hunter.group.position.set(hunter.x, 0, hunter.z);
  hunter.group.rotation.y = hunter.yaw + hunter.twitch*0.25 + (rndFx()-0.5)*0.55*gl;
  hunter.group.rotation.z = Math.sin(hunter.bob*0.5)*0.045 + hunter.twitch*0.1;
  hunter.group.updateMatrixWorld(true);
  P.legL.tip.getWorldPosition(_hv1);
  P.legR.tip.getWorldPosition(_hv2);
  var lowest = Math.min(_hv1.y, _hv2.y);
  if(isFinite(lowest)) hunter.group.position.y = -lowest + (rndFx()-0.5)*0.14*gl;
  footIK(P, dt);

  // 目の光源を頭の位置へ
  if(hunterEyeLight){
    hunter.group.updateMatrixWorld(true);
    P.head.getWorldPosition(_hv1);
    hunterEyeLight.position.set(_hv1.x, _hv1.y, _hv1.z);
    // lit には既に状態ぶんが入っているので、光源側では脈動だけを掛ける
    hunterEyeLight.intensity = (hunter.eyeOff > 0 ? 0 : 1) * pulse *
      (chasing ? 2.4 : (hunter.mode === 'hunt' ? 1.5 : 0.95));
  }

  hunter.shadow.position.set(hunter.x, 0.03, hunter.z);
  var shs = 1.45 + Math.abs(cw)*0.12;
  hunter.shadow.scale.set(shs, shs, 1);

  if(moved > 0){
    hunter.stepAcc += moved;
    if(hunter.stepAcc > (chasing ? 0.95 : 1.5)){
      hunter.stepAcc = 0;
      if(hd < 40){
        // プレイヤーの向きを基準にした左右の成分をパンに使う
        var rvx = Math.cos(player.viewYaw), rvz = -Math.sin(player.viewYaw);
        var lat = ((hunter.x - player.x)*rvx + (hunter.z - player.z)*rvz) / Math.max(1, hd);
        // 水の中の足音は水音に紛れる（第6章）。人の耳にもボットの耳にも同じだけ
        var hWet = inWater(hunter.x, hunter.z) ? 0.5 : 1;
        if(hWet < 1) Audio2.splash(hd, clamp(lat, -1, 1) * 0.85, chasing ? 0.55 : 0.4);
        else {
          var fvx = -Math.sin(player.viewYaw), fvz = -Math.cos(player.viewYaw);
          var fwdS = ((hunter.x - player.x)*fvx + (hunter.z - player.z)*fvz) / Math.max(1, hd);
          Audio2.hunterStep(hd, chasing, clamp(lat, -1, 1) * 0.85, !info.los, fwdS);
          // 足音の接近を手に（第 12.4 節）。9m より近い足音だけ、近いほど強く
          if(hd < 9) haptic(Math.round(6 + (9 - hd) * 2.2));
        }
        if(hd < 26) soundCue(chasing ? '走る足音' : '足音', hd, chasing);
        /* 足音は「鳴った・左右・こもったか・走っているか」を控える（距離は渡さない）。
           走りの足音は 115Hz・短い減衰、歩きは 82Hz・長い減衰で鳴り分けている。
           人はこの違いを聞き分けて「こっちへ走ってきている」と分かるので、
           ボットにも早期警報として渡してよい。 */
        if(BOT.on){ BOT.ear.stepT = player.time; BOT.ear.stepChase = !!chasing;
                    BOT.ear.stepPan = clamp(lat,-1,1)*0.85; BOT.ear.stepHot = !!info.los;
                    // 向きは左右成分ではなく世界角で控える（前後が潰れない）
                    BOT.ear.stepWorld = Math.atan2(-(hunter.x-player.x), -(hunter.z-player.z));
                    /* 足音の大きさも渡す。Audio2 が実際に鳴らしている減衰そのもので、
                       耳に届く音量に等しい。距離は 40m まで連続に効いていて、
                       立体音響の vol（mode で 0.42〜1.0 倍される）と違い
                       徘徊中でも同じ音量で鳴る。ここを使っていなかったせいで、
                       ボットは徘徊・捜索中の接近にまるで気づけなかった
                       （被弾の実例：hunt のまま 13.4m→4.6m を 6 秒で詰められている）。 */
                    BOT.ear.stepAtt = (6/(6+hd)) * (1 - Math.pow(clamp(hd/40,0,1),3)) *
                                      (info.los ? 1 : 0.55) * hWet; }
      }
    }
  }

  // 攻撃
  hunter.attackCd -= dt;
  if(hunter.stunT > 0) hunter.stunT -= dt;
  if(hunter.swingT > 0) hunter.swingT -= dt;
  // 気づかれずに隠れている間は、真横を通られても襲われない。
  // （攻撃条件が距離だけだったので、徘徊中に前を素通りされただけで殴られていた）
  var noticed = !(player.hiding && !player.hideSeen);
  // 接触した瞬間に判定が出る。モーションは見た目としてあとから再生される
  if(!cheats.pacifist && hd < 1.25 && noticed && hunter.attackCd <= 0 && hunter.stunT <= 0 &&
     hunter.swingT <= 0 && hunter.spawnGrace <= 0){
    hunter.attackCd = 1.7;
    hunter.punchArm = (rndFx() < 0.5) ? -1 : 1;   // どちらの腕で殴るかは毎回変わる
    hunter.swingT = SWING_DUR;        // 殴打モーションの長さ
    hunter.stunT = 3.0;               // 振り抜いたあとの硬直。逃げ直す猶予になる
    if(!cheats.godmode) player.hp = clamp(player.hp - DIFF[settings.diff].dmg, 0, 100);
    player.hits = (player.hits || 0) + 1;
    player.lastHitBy = 'hunter';
    tele('grab', { x:+player.x.toFixed(1), z:+player.z.toFixed(1), mode:hunter.mode, left:escapesLeft() });
    player.shake = 1.4; player.hurtT = 0.5;
    if(!cheats.godmode) player.sanity = clamp(player.sanity-22,0,100);
    Audio2.hurt();
    haptic(120);
    if(player.hp <= 0){ doDeath(); return; }
    /* 掴まれる。一瞬動けず、視線が追跡者へ引かれ、振りほどいて弾かれる
       （弾く向きは掴まれた瞬間の向きで決めておく。0.7 秒の間に相手が
       回り込んでも、逃げる方向がぶれないように） */
    var kx = player.x - hunter.x, kz = player.z - hunter.z;
    var kl = Math.max(0.001, Math.sqrt(kx*kx+kz*kz));
    player.grabT = (playAs === 'hunter' || BOT.on) ? 0 : GRAB_T;
    player.grabX = kx/kl; player.grabZ = kz/kl;
    if(player.grabT <= 0) collideMove(player.x + kx/kl*0.9, player.z + kz/kl*0.9);
    else toast(escapesLeft() > 0 ? '掴まれた — 振りほどいた（あと ' + escapesLeft() + ' 回）'
                                  : '掴まれた — 次はもう振りほどけない', 2.6);
  }

  // 緊張感を音に反映
  var tension = clamp(1 - hd/24, 0, 1) * (hunter.mode==='chase'?1:0.5);
  Audio2.setTension(tension);
  // 劇伴の段（第 2 章 setScore）。見えていなくても、近くを捜していれば段が上がる
  var lvl = hunter.mode === 'chase' ? 3 :
            ((hunter.mode === 'hunt' && hd < 16) || hd < 9) ? 2 :
            (hunter.mode === 'hunt' || hd < 22) ? 1 : 0;
  Audio2.setScore(lvl);
}

/* 声を鳴らす条件。
   遷移は「初めてそうなった瞬間」だけ拾う。毎フレーム比べると
   patrol⇄hunt が細かく往復する場面で連呼になる。
   遷移が無い間も時々独りごとを鳴らす——完全に黙られると持続音の
   バスが環境音に溶けて、居ることに気づけなくなる。
   ゲーム側の乱数（rnd）は絶対に引かない。引くと種が同じでも
   挙動がずれて、これまでの回帰結果と比べられなくなる。 */
var VOX_GAP = 1.1;                       // 声どうしが重ならない最短間隔
var voxPrevMode = 'patrol', voxT = 0, voxIdleT = 5;
function resetHunterVox(){
  voxPrevMode = 'patrol'; voxT = 0; voxIdleT = 4 + rndFx()*5;
}
/* --- 歩容 -----------------------------------------------------------------
   これまで腿を sin 一本で振っていた。そのため
     ・立脚と遊脚が同じ長さ・同じ速さ（人は立脚 60% / 遊脚 40%）
     ・膝が「前へ出した側だけ曲がる」単純な折れ方
     ・足首が一度も動かない（foot ジョイントはあるのに未使用だった）
     ・接地の瞬間に何も起きない＝体重が乗らない
   の 4 つが同時に起きて、棒を交互に振っているように見えていた。
   歩行周期の節目を表に書き、位相で引く。表は [位相, 角度] の昇順で、
   端は巻き戻して繋ぐ。位相 0 が接地（踵接地）で、足音もそこで鳴る
   （bob は 1 歩ぶんで π 進み、stepAcc も同じ moved で駆動しているため）。 */
function gaitKey(tbl: any, ph: any){
  ph -= Math.floor(ph);
  var n = tbl.length, i;
  for(i=0;i<n;i++) if(tbl[i][0] > ph) break;
  var a = tbl[(i-1+n)%n], b = tbl[i%n];
  var t0 = a[0], t1 = b[0];
  if(i === 0) t0 -= 1;
  if(i === n) t1 += 1;
  var u = (ph - t0) / Math.max(1e-4, t1 - t0);
  u = u*u*(3 - 2*u);
  return a[1] + (b[1] - a[1])*u;
}
/* 歩き。0=踵接地 → 0.15 荷重で膝がたわむ → 0.35 立脚中期（膝は伸びる）
   → 0.58 蹴り出し（足首が伸び切る） → 0.72 遊脚で膝が深く折れる
   → 0.90 振り出し切って接地へ戻る。 */
/* 振り幅は歩幅から決まる。足音は 1.5m ごとに鳴る（hStride）ので、1 歩で
   1.5m 進むことになっている。脚の長さは腿 0.42＋脛 0.40＝0.82m なので、
   ±0.52rad では 2×0.82×sin(0.52)＝0.81m しか進まず、残りは足が地面を
   滑って埋めていた。1.5 倍に広げて 1.15m まで詰める（人の脚の可動域を
   超えるので完全には合わせない。残りは腰のひねりが吸収する）。 */
var GAIT_HIP_W   = [[0.00, 0.78],[0.20, 0.42],[0.45,-0.12],[0.60,-0.60],[0.78, 0.15],[0.92, 0.69]];
var GAIT_KNEE_W  = [[0.00,-0.10],[0.12,-0.32],[0.35,-0.06],[0.58,-0.28],[0.72,-1.15],[0.88,-0.42]];
var GAIT_ANK_W   = [[0.00, 0.16],[0.10,-0.02],[0.40,-0.14],[0.56,-0.42],[0.66, 0.14],[0.90, 0.10]];
// 走り。立脚が短く、膝は深く折れ、蹴り出しが強い
var GAIT_HIP_R   = [[0.00, 0.72],[0.16, 0.34],[0.34,-0.30],[0.46,-0.62],[0.66, 0.20],[0.86, 0.70]];
var GAIT_KNEE_R  = [[0.00,-0.30],[0.10,-0.62],[0.30,-0.30],[0.46,-0.55],[0.62,-1.70],[0.84,-0.60]];
var GAIT_ANK_R   = [[0.00, 0.10],[0.08,-0.10],[0.30,-0.22],[0.44,-0.55],[0.58, 0.20],[0.84, 0.14]];
/* 歩きと走りの表を混ぜる。mode が chase に入った瞬間に表を差し替えると、
   その 1 フレームで腿が 0.2 rad 飛ぶ（歩きの立脚中期と走りの蹴り出しが
   同じ位相に並んでいるため）。混ぜる比を時定数 0.25 秒で送る。 */
function gaitMix(tw: any, tr: any, ph: any, rk: any){
  return rk <= 0.001 ? gaitKey(tw, ph)
       : rk >= 0.999 ? gaitKey(tr, ph)
       : gaitKey(tw, ph)*(1-rk) + gaitKey(tr, ph)*rk;
}

function updateHunterVox(dt: number, info: any, hs: any){
  // 追跡者がまだ出ていない間は、状態だけ追って声は出さない
  if(!hs){ voxPrevMode = hunter.mode; return; }
  voxT = Math.max(0, voxT - dt);
  voxIdleT -= dt;
  var m = hunter.mode, pm = voxPrevMode;
  voxPrevMode = m;
  if(voxT > 0) return;

  var kind = -1;
  if(m === 'chase' && pm !== 'chase')      kind = 2;   // 見つけた
  else if(pm === 'chase' && m !== 'chase') kind = 4;   // 見失った
  else if(m === 'hunt' && pm === 'patrol') kind = 0;   // 何かに気づいた
  else if(voxIdleT <= 0){
    // 追っている間は笑い、それ以外は呟きか低い唸り
    kind = (m === 'chase') ? 1 : (rndFx() < 0.55 ? 3 : 0);
  }
  if(kind < 0) return;

  Audio2.hunterVocal(kind, info.hd, hs.pan, !info.los);
  soundCue('声', info.hd, hunter.mode === 'chase');
  voxT = VOX_GAP + rndFx()*0.6;
  // 追跡中は短い間隔で笑い続ける。探索中はたまにでいい
  /* 追跡中の間隔。最初 2.6〜5.0 秒にしていたが、実測では追跡の大半が
     それより短く終わっていて笑い声が一度も鳴らなかった。1.9 秒まで詰める。 */
  voxIdleT = (m === 'chase') ? (1.9 + rndFx()*1.8) : (7 + rndFx()*9);
}

function updateEnv(dt: number, info: any){
  // 非常灯：最寄り n 個だけをライトプールに割り当てる
  var lamps = world.lamps.slice();
  lamps.sort(function(a: any,b: any){
    var da = (a.x-player.x)*(a.x-player.x)+(a.z-player.z)*(a.z-player.z);
    var db = (b.x-player.x)*(b.x-player.x)+(b.z-player.z)*(b.z-player.z);
    return da-db;
  });
  lampFlick += dt;
  for(var i=0;i<lightPool.length;i++){
    var L = lamps[i];
    if(L && i < QC.lamps){
      var dd = Math.sqrt((L.x-player.x)*(L.x-player.x)+(L.z-player.z)*(L.z-player.z));
      var fl = 0.55 + 0.45*Math.sin(lampFlick*7 + L.flick) * (Math.sin(lampFlick*2.3+L.flick)>0.7?1:0.25);
      fl = lerp(0.62, fl, settings.flash);          // 点滅の強さ（設定）
      var inten = dd < 22 ? (1.5*fl*(world.power ? 2.0 : 1)) : 0;
      if(world.blackout && !world.power) inten = 0;           // 非常回路が落ちている
      lightPool[i].position.set(L.x, WALL_H-0.35, L.z);
      lightPool[i].intensity = inten;
      L.mesh.material.color.setRGB(1, 0.72*fl+0.2, 0.35*fl+0.15);
    }else{
      lightPool[i].intensity = 0;
    }
  }
  cullLights();

  // 誘導灯：非常口が開いてから、近いものだけがじわりと点く。
  // 遠くまで一斉に光ると迷路の形が読めてしまうので、可視距離で絞る。
  if(world.zones.length){
    var t2 = performance.now()*0.001;
    var wantLit = (world.exit && world.exit.open) ? 1 : 0;
    for(var zi2=0; zi2<world.zones.length; zi2++){
      var Z = world.zones[zi2];
      var zdx = Z.x - player.x, zdz = Z.z - player.z;
      var zd2 = Math.sqrt(zdx*zdx + zdz*zdz);
      var near2 = zd2 < 15 ? 1 : 0;
      var target = wantLit * near2;
      Z.lit += (target - Z.lit) * (1 - Math.pow(0.02, dt));
      var pulse = 0.72 + 0.28*Math.sin(t2*3.1 + Z.x*0.7 + Z.z*0.5);
      Z.mat.opacity = Z.lit * pulse * (world.power ? 1 : 0.82);
      /* 消えている間は描画自体を省く（点灯前はこれで27回分のドローコールが浮く）。
         ただし単一の閾値で切ると、明滅（pulse）と 15m の境目が重なったとき
         毎フレーム on/off して矢印がちらつく。入りと切りをずらす。 */
      Z.arrow.visible = Z.arrow.visible ? (Z.mat.opacity > 0.008)
                                        : (Z.mat.opacity > 0.030);
    }
  }

  // 拾得物のふわふわ
  var t = performance.now()*0.001;
  for(var r=0;r<world.records.length;r++){
    var o = world.records[r]; if(o.taken) continue;
    o.mesh.position.y = 0.9 + Math.sin(t*1.5+o.phase)*0.08;
    o.mesh.rotation.y = t*0.6 + o.phase;
    o.spr.position.y = o.mesh.position.y;
    o.spr.material.opacity = 0.4 + 0.2*Math.sin(t*2+o.phase);
  }
  for(var b=0;b<world.batteries.length;b++){
    var q = world.batteries[b]; if(q.taken) continue;
    q.mesh.rotation.y = t*1.1 + q.phase;
    q.mesh.position.y = 0.62 + Math.sin(t*1.8+q.phase)*0.05;
    q.spr.position.y = q.mesh.position.y;
  }
  if(world.key && !world.key.taken){
    world.key.grp.rotation.y = t*0.9 + world.key.phase;
    world.key.grp.position.y = 0.85 + Math.sin(t*1.6 + world.key.phase)*0.07;
    world.key.spr.position.y = world.key.grp.position.y;
  }
  if(world.exit && world.exit.open){
    world.exitLight.intensity = 1.3 + Math.sin(t*3)*0.4;
  }

  // --- 立体音響：追跡者・非常灯・非常口をそれぞれの方向から鳴らす ---
  if(hunter.group && hunter.group.visible){
    updatePathField(dt);
    var hs = spatial(hunter.x, hunter.z, 30, !info.los);
    var hsA = spatialPath(hunter.x, hunter.z, 30, !info.los);        // 耳に届く音は道のりで
    var modeGain = hunter.mode === 'chase' ? 1.0 : (hunter.mode === 'hunt' ? 0.66 : 0.42);
    var hv = hs.vol * 0.42 * modeGain;
    Audio2.setHunterVoice(hsA.vol * 0.42 * modeGain, hsA.pan, hsA.cut, hsA.fwd);
    /* ボットの耳は今までどおりまっすぐの距離の値を渡す。道のりの音に
       替えると、これまでの測定（ボット 240 本）と比べられなくなるため。
       人の耳の方が情報は多い（回り込みの向きが分かる）ので、ボットが
       有利になることはない。 */
    // 観戦モードの「耳」。ボットはここで鳴っている値しか受け取らない
    if(BOT.on){ BOT.ear.vol = hv; BOT.ear.pan = hs.pan; BOT.ear.cut = hs.cut;
                BOT.ear.muffled = (hs.cut <= 440); }
    updateHunterVox(dt, info, hs);
  }else{
    updateHunterVox(dt, info, null);
    Audio2.setHunterVoice(0, 0, 400);
    if(BOT.on){ BOT.ear.vol = 0; BOT.ear.muffled = true; }
  }
  for(var lb2=0; lb2<2; lb2++){
    var LL = lamps[lb2];
    if(LL && lightPool[lb2] && lightPool[lb2].intensity > 0.01){
      var ls = spatial(LL.x, LL.z, 22, !hasLOS(world.grid, player.x, player.z, LL.x, LL.z));
      Audio2.setLampVoice(lb2, ls.vol * 0.20, ls.pan, ls.cut, ls.fwd);
    }else{
      Audio2.setLampVoice(lb2, 0, 0, 400);
    }
  }
  if(world.exit && world.exit.open){
    var es = spatial(world.exit.doorX, world.exit.doorZ, 150,
                     !hasLOS(world.grid, player.x, player.z, world.exit.x, world.exit.z), 30);
    Audio2.setExitVoice(es.vol * 0.30, es.pan, Math.max(es.cut, 900), es.fwd);
  }else{
    Audio2.setExitVoice(0, 0, 400);
  }

  // 環境音
  /* 環境音。きしみ 1 種類だけだったのを 5 種類にして、間隔も詰めた。
     どこかで何かが鳴る頻度が、無人の建物の広さの感じ方を決める。
     追跡者が近いときは鳴らさない——本物の物音と紛れると、
     足音を聞き分ける遊びが壊れる。 */
  updateCheatView(dt);
  updateDust(dt);
  updateExitShaft(dt);
  updateLampShafts(dt);

  ambientCreakT -= dt;
  if(ambientCreakT <= 0){
    var quiet = !(hunter.mode === 'chase') && info.hd > 14;
    if(quiet){
      var kind = (rndFx()*5)|0;
      if(kind === 4) Audio2.creak();
      else Audio2.ambientOne(kind, (rndFx()*2-1)*0.8, 0.25 + rndFx()*0.7);
    }
    ambientCreakT = 6 + rndFx()*11;
  }

  // 心音
  var bpm = 62 + (100-player.sanity)*0.85 + (hunter.mode==='chase'?34:0) + (player.running?12:0);
  bpm = clamp(bpm, 58, 190);
  heartT -= dt;
  if(heartT <= 0){
    heartT = 60/bpm;
    if(player.sanity < 78 || hunter.mode==='chase'){
      Audio2.heart(clamp((100-player.sanity)/100 + (hunter.mode==='chase'?0.5:0), 0.15, 1) * 0.5);
      /* 心拍を手にも伝える（設計指示書 第 12.4 節）。追われているか、正気がかなり削れたときだけ。
         いつも鳴らすと慣れて何も伝わらなくなる */
      if(hunter.mode === 'chase' || player.sanity < 45) haptic(hunter.mode === 'chase' ? 14 : 9);
    }
  }
  return bpm;
}

/* 検証用の間引き。HUD は状態を読むだけで書き換えない（ボットも DOM を読まない）
   ので、ヘッドレスでは丸ごと飛ばせる。profile では jsdom の DOM 操作が実行時間の
   53% を占めていて、そのほとんどがここの textContent 代入と ECG 描画だった。
   実機では常に false。 */
/* 計器の目覚め。値が動いたとき・危ないとき・拾った直後だけ濃く出す。
   何も起きていない間は沈ませて、暗がりの方を見させる。
   情報を隠すためではなく、変化に注意を向けるための切り替え。 */
var HUDW = { t:0, bat:100, sta:100, hp:100, got:-1 };
function hudWake(sec: number){ HUDW.t = Math.max(HUDW.t, sec); }

/* 見え方に関わるチートの面倒をまとめて見る。
   毎フレーム状態を合わせにいく（切り替えた瞬間に効いてほしいし、
   切ったときに元へ戻らないと「直らないバグ」に見える）。 */
var CV: any = { fov:0, marked:false };
function updateCheatView(dt: number){
  // 視野
  var wantFov = ((window.innerHeight > window.innerWidth) ? 78 : 70) + (cheats.wideView ? 22 : 0) + settings.fov;
  if(state === STATE.PLAY && Math.abs(camera.fov - wantFov) > 0.01){
    camera.fov = lerp(camera.fov, wantFov, 1 - Math.pow(0.02, dt));
    camera.updateProjectionMatrix();
  }
  // 壁越しの目印。深度テストを切ると、壁の向こうでも描かれる
  var wantItems = !!cheats.markItems, wantHides = !!cheats.markHides;
  if(CV.items !== wantItems){
    CV.items = wantItems;
    var mark = function(sp: any){ if(!sp) return;
      sp.material.depthTest = !wantItems; sp.renderOrder = wantItems ? 12 : 0;
      sp.material.opacity = wantItems ? 0.9 : 0.55; sp.material.needsUpdate = true; };
    world.records.forEach(function(r: any){ mark(r.spr); });
    world.batteries.forEach(function(b: any){ mark(b.spr); });
    if(world.key) mark(world.key.spr);
  }
  if(CV.hides !== wantHides){
    CV.hides = wantHides;
    world.hides.forEach(function(h: any){
      if(!h.group) return;
      h.group.traverse(function(o: any){
        if(!o.isMesh || !o.material || !o.material.emissive) return;
        if(wantHides){
          if(o.userData.emSave === undefined) o.userData.emSave = o.material.emissiveIntensity || 0;
          o.material.emissive.setHex(0x2fae86);
          o.material.emissiveIntensity = 0.55;
        }else if(o.userData.emSave !== undefined){
          o.material.emissive.setHex(0x000000);
          o.material.emissiveIntensity = o.userData.emSave;
        }
      });
    });
  }
  // 内部の値
  var dbg = $('dbg');
  if(dbg){
    if(cheats.showDebug){
      dbg.hidden = false;
      dbg.textContent =
        'pos ' + player.x.toFixed(1) + ',' + player.z.toFixed(1) +
        '  hunter ' + hunter.x.toFixed(1) + ',' + hunter.z.toFixed(1) + ' ' + hunter.mode +
        '  d ' + Math.sqrt((hunter.x-player.x)*(hunter.x-player.x)+(hunter.z-player.z)*(hunter.z-player.z)).toFixed(1) +
        '  memT ' + hunter.memT.toFixed(1) + '  stun ' + hunter.stunT.toFixed(1) +
        '  hp ' + Math.round(player.hp) + '  bat ' + Math.round(player.battery) +
        '  sta ' + Math.round(player.stamina) + '  fps ' + Math.round(fpsShown);
    }else dbg.hidden = true;
  }
}

function updateHUD(dt: number, bpm: any, info: any){
  if(skipUI) return;
  // 変化の検出。しきい値はどれも「人が気づく程度」に置く
  if(Math.abs(player.battery - HUDW.bat) > 0.8 ||
     Math.abs(player.stamina - HUDW.sta) > 6 ||
     player.hp !== HUDW.hp) hudWake(2.6);
  if(player.got !== HUDW.got){ hudWake(3.4); HUDW.got = player.got; }
  HUDW.bat = player.battery; HUDW.sta = player.stamina; HUDW.hp = player.hp;
  var danger = (hunter.mode === 'chase') || player.hp < 55 || player.battery < 22 || player.stamina < 25;
  HUDW.t = Math.max(0, HUDW.t - dt);
  var awake = danger || HUDW.t > 0;
  $('vitals').classList.toggle('awake', awake);
  $('objective').classList.toggle('awake', awake);
  $('lowhp').style.opacity = (player.hp >= 70 ? 0 : (1 - player.hp/70) * 0.85).toFixed(3);

  updateBar('barBat', player.battery/100);
  updateBar('barSta', player.stamina/100);
  updateBar('barHp',  escapesLeft() / Math.max(1, escapesMax()));
  $('txtBat').textContent = Math.round(player.battery) + '%';
  $('txtSta').textContent = Math.round(player.stamina) + '%';
  // 体力の数字ではなく「あと何回振りほどけるか」を出す（第 10 章 escapesLeft）
  var escL = escapesLeft();
  $('txtHp').textContent  = escL > 0 ? 'あと ' + escL + ' 回' : '次で終わり';
  drawECG(dt, bpm);
  drawRadar(dt);
  if(hunterMark){
    var showMark = (detectMode() === 2) && hunter.group && hunter.group.visible;
    hunterMark.visible = showMark;
    if(showMark){
      hunterMark.position.set(hunter.x, 2.5, hunter.z);
      hunterMark.material.opacity = 0.35 + 0.25*Math.sin(performance.now()*0.006);
    }
  }

  var panic = 1 - player.sanity/100;
  $('panic').style.opacity = (panic*0.75).toFixed(3);

  if(player.hurtT > 0){
    player.hurtT -= dt;
    $('hurt').style.opacity = clamp(player.hurtT/0.5, 0, 1) * 0.55;
  }else{
    $('hurt').style.opacity = '0';
  }

  if(toastT > 0){
    toastT -= dt;
    if(toastT <= 0) $('toast').classList.remove('on');
  }
  updateTape(dt);
  if(noteT > 0){
    noteT -= dt;
    if(noteT <= 0){ $('note').classList.remove('on'); stopTape(); }
  }
}


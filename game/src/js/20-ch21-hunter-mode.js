/* =========================================================================
   21. 追跡者モード（敵側で遊ぶ）

   逃げる側を第19章のボットに任せ、人間は追跡者を動かす。
   ゲームのルール・数値はそのまま使う。変えたのは「誰がどちらを操作するか」
   だけで、追跡者の速度も攻撃判定も AI が使っているものと同じ。

   入力の取り合いに注意。ボットは input.keys と input.lookX を上書きするので、
   人間の操作は botUpdate が走る前に HIN へ写し取っておく。
   ========================================================================= */
var HIN = { fwd:0, side:0, run:false, lookX:0, lookY:0 };
var huntCam = { pitch:0, bob:0, note:'', noteT:0, sprintT:0 };
var avatar = /** @type {any} */ (null);      // 逃げる側の分身（追う側から見える身体）

/* 人間の操作を写し取る。
   移動は humanKeys / stickIn から読むので input.fwd・input.side には触らない。
   ここを空にすると逃げる側が壊れる（実測：平均速度 4.48 → 2.12 m/s）。
   タッチ環境では「キーが全部離れたフレームは直前の値を保つ」という
   既存の規則があり、ボットの歩みはそれに依存している。
   視点だけは input.lookX を共有しているので、ここで取り上げて空にする
   （このあと botSteer が自分ぶんを積む）。 */
function captureHunterInput(){
  var k = humanKeys;
  var f = (k.KeyW||k.ArrowUp?1:0) - (k.KeyS||k.ArrowDown?1:0);
  var s = (k.KeyD||k.ArrowRight?1:0) - (k.KeyA||k.ArrowLeft?1:0);
  if(stickId !== null){ HIN.fwd = stickIn.fwd; HIN.side = stickIn.side; HIN.run = stickIn.run; }
  else { HIN.fwd = f; HIN.side = s; HIN.run = !!(k.ShiftLeft || k.ShiftRight); }
  HIN.lookX += input.lookX; HIN.lookY += input.lookY;
  input.lookX = 0; input.lookY = 0;
}

/* 逃げる側の身体。一人称では自分の身体を描く必要がなかったので、
   ここで初めて要る。手回しランプは実際の SpotLight で持たせる
   （追う側にとって、廊下の先で揺れる光がいちばんの手がかりになる）。 */
function buildAvatar(){
  if(avatar){ scene.remove(avatar.group); disposeObject(avatar.group); avatar = null; }
  var g = new THREE.Group();
  var skin  = new THREE.MeshStandardMaterial({ color:0xb9a08c, roughness:0.85 });
  var cloth = new THREE.MeshStandardMaterial({ color:0x46504c, roughness:0.9 });
  var pants = new THREE.MeshStandardMaterial({ color:0x2c3330, roughness:0.9 });

  /* 胴は 1 枚の箱ではなく、胸・腹・腰の 3 段にする。
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
  hairB.position.set(0, 0.01, -0.095); head.add(hairB);

  function limb(/** @type {any} */ w, /** @type {any} */ h, /** @type {any} */ mat){
    var pivot = new THREE.Group();
    var m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h/2; pivot.add(m);
    g.add(pivot); return pivot;
  }
  var armL = limb(0.11, 0.52, cloth); armL.position.set( 0.26, 1.42, 0);
  var armR = limb(0.11, 0.52, cloth); armR.position.set(-0.26, 1.42, 0);
  var legL = limb(0.13, 0.80, pants); legL.position.set( 0.10, 0.86, 0);
  var legR = limb(0.13, 0.80, pants); legR.position.set(-0.10, 0.86, 0);
  // 靴。足元が地面に接している手がかりになる
  var shoeM = new THREE.MeshStandardMaterial({ color:0x15181a, roughness:0.85 });
  [legL, legR].forEach(function(lg){
    var sh2 = new THREE.Mesh(new THREE.BoxGeometry(0.135, 0.07, 0.24), shoeM);
    sh2.position.set(0, -0.815, 0.03); lg.add(sh2);
  });

  // ランプ本体（右手）。灯りは別の SpotLight
  var lampMat = new THREE.MeshStandardMaterial({ color:0xd8d2c0, emissive:0xfff0d0,
                                                 emissiveIntensity:0, roughness:0.5 });
  var lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8), lampMat);
  lamp.rotation.x = Math.PI/2; lamp.position.set(0, -0.50, 0.07);
  armR.add(lamp);

  /* 光の筋を目に見える形で出す。追う側にとって、廊下の先で揺れる光の筋が
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

  var spot = new THREE.SpotLight(0xfff0d0, 0, 18, 0.52, 0.55, 1.6);
  var tgt = new THREE.Object3D();
  scene.add(spot); scene.add(tgt); spot.target = tgt;
  scene.add(g);
  avatar = { group:g, head:head, armL:armL, armR:armR, legL:legL, legR:legR,
             lampMat:lampMat, spot:spot, tgt:tgt, beam:beam, phase:0 };
}

/* 分身の姿勢。歩幅は player.bob（ゲーム側が歩行で進める位相）に合わせる。
   ここが合っていないと、追う側から見て「滑って移動している」ように見える。 */
function updateAvatar(/** @type {number} */ dt, /** @type {number} */ spd01){
  if(!avatar) return;
  var a = avatar, hiding = !!player.hiding;
  a.group.visible = !hiding;
  a.spot.visible = !hiding;
  if(hiding){
    a.spot.intensity = 0;
    if(a.beam) a.beam.visible = false;
    return;
  }

  a.group.position.set(player.x, 0, player.z);
  a.group.rotation.y = player.viewYaw;
  var sw = Math.sin(player.bob) * (0.30 + 0.55*spd01);
  a.armL.rotation.x =  sw; a.armR.rotation.x = -sw*0.55;   // 右手はランプを構える
  a.legL.rotation.x = -sw; a.legR.rotation.x =  sw;
  a.armR.rotation.x -= 0.55;
  a.head.rotation.x = -player.pitch*0.5;

  // ランプ。位置は右手の先、向きは視線
  var lit = player.lamp;
  a.lampMat.emissiveIntensity = lit ? 2.2 : 0;
  var hx = -Math.sin(player.viewYaw), hz = -Math.cos(player.viewYaw);
  var rx =  Math.cos(player.viewYaw), rz = -Math.sin(player.viewYaw);
  a.spot.position.set(player.x - rx*0.26 + hx*0.18, 0.96, player.z - rz*0.26 + hz*0.18);
  var pit = Math.sin(-player.pitch);
  a.tgt.position.set(a.spot.position.x + hx*8, 0.96 + pit*8, a.spot.position.z + hz*8);
  a.spot.intensity = lit ? 3.0 : 0;
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
  }
}

/* 追跡者を人間の入力で動かす。
   速度は AI と同じ数値を使う（歩き 3.111、突進は chaseMul と rage の上限まで）。
   スタミナは持たせない代わりに、突進は押している間だけ。
   逃げる側の全力疾走 5.755 には届かないので、直線で追いつくゲームではない。
   壁と什器への押し戻しも AI と同じ関数を通す。 */
function moveHunterByInput(/** @type {number} */ dt){
  var d = DIFF[settings.diff];
  hunter.target = null;
  if(cheats.freeze || hunter.stunT > 0 || hunter.swingT > 0) return 0;

  var f = clamp(HIN.fwd, -1, 1), s = clamp(HIN.side, -1, 1);
  var len = moveScale(f, s);
  if(len > 0.0001 && (f*f + s*s) > 1){ var nl = Math.sqrt(f*f + s*s); f/=nl; s/=nl; }
  if(len <= 0.06) return 0;

  var running = HIN.run && f > 0.25;
  huntCam.sprintT = running ? huntCam.sprintT + dt : 0;
  var spd = hunter.speed * (running ? d.chaseMul : 1.0) +
            (running ? Math.min(d.rage, huntCam.sprintT * 0.09) : 0);

  var sy = Math.sin(hunter.yaw), cy = Math.cos(hunter.yaw);
  var dirX = (-sy*f + cy*s), dirZ = (-cy*f - sy*s);
  var dl = Math.sqrt(dirX*dirX + dirZ*dirZ) || 1;
  dirX /= dl; dirZ /= dl;

  var bx = hunter.x, bz = hunter.z;
  var mv = spd * dt * len;
  // 軸ごとに解くのではなく、AI と同じ「進めてから押し戻す」方式で揃える
  hunter.x += dirX*mv; hunter.z += dirZ*mv;
  var fix = pushOutOfWalls(hunter.x, hunter.z, 0.34);
  hunter.x = fix.x; hunter.z = fix.z;
  fix = pushOutOfSolids(hunter.x, hunter.z, 0.30);
  hunter.x = fix.x; hunter.z = fix.z;
  return Math.sqrt((hunter.x-bx)*(hunter.x-bx) + (hunter.z-bz)*(hunter.z-bz));
}

/* 追跡者の視点。頭の位置に置き、頭のメッシュだけ隠して視界を空ける。
   身体と腕は残す（自分の腕が見えているほうが、間合いが分かる）。 */
function updateHunterCam(/** @type {number} */ dt){
  // 感度と反転はポインタ／マウス側で既に掛かっている。ここで掛け直さない
  hunter.yaw -= HIN.lookX;
  huntCam.pitch = clamp(huntCam.pitch - HIN.lookY, -0.8, 0.8);
  HIN.lookX = 0; HIN.lookY = 0;

  var P = hunter.parts;
  if(P && P.head) P.head.visible = false;
  var eye = 1.86;
  if(hunter.group) eye = 1.86 + hunter.group.position.y;
  huntCam.bob += dt * 6.0;
  camera.position.set(hunter.x, eye, hunter.z);
  camera.rotation.set(huntCam.pitch, hunter.yaw, 0);
  // 攻撃の硬直中は視界を揺らす（当てた手応え）
  if(hunter.stunT > 0){
    camera.rotation.x += Math.sin(hunter.stunT*38) * 0.05 * hunter.stunT;
  }
}

// 追う側の HUD。逃げる側の残り枚数と、気配の強さだけを出す
function huntHUD(){
  var el = $('huntHud');
  if(!el) return;
  if(playAs !== 'hunter'){ el.hidden = true; return; }
  el.hidden = false;
  var dx = player.x - hunter.x, dz = player.z - hunter.z;
  var hd = Math.sqrt(dx*dx + dz*dz);
  var near = clamp(1 - (hd - 2) / 26, 0, 1);
  var note = hunter.mode === 'chase' ? '見えている。逃がすな'
           : (hunter.mode === 'hunt' ? '近い。音がした方へ' : '獲物を探せ');
  if(world.endgame) note = 'カルテを揃えた。もう隠れられない';
  $('huntNote').textContent = note;
  $('huntMtr').style.width = Math.round(near*100) + '%';
  var sub = 'カルテ ' + player.got + ' / ' + player.need;
  if(world.endgame){
    // 全部集められた後は居場所が分かる（AI 側と同じ扱い）
    var rel = ((Math.atan2(-dx, -dz) - hunter.yaw + Math.PI*3) % TAU) - Math.PI;
    sub += '　' + dirName(rel) + ' ' + Math.round(hd) + 'm';
  }
  $('huntSub').textContent = sub;
}

function huntReset(){
  huntCam.pitch = 0; huntCam.bob = 0; huntCam.sprintT = 0;
  HIN.fwd = HIN.side = HIN.lookX = HIN.lookY = 0; HIN.run = false;
  if(playAs === 'hunter'){
    buildAvatar();
    // 追う側は逃げる側の「気配」を持たない代わりに、視界と足音で追う。
    // 開始直後に殴れてしまわないよう、AI と同じ猶予を置く
    hunter.spawnGrace = 3.0;
  }else if(avatar){
    scene.remove(avatar.group); scene.remove(avatar.spot); scene.remove(avatar.tgt);
    if(avatar.beam){ scene.remove(avatar.beam); avatar.beam.geometry.dispose(); avatar.beam.material.dispose(); }
    disposeObject(avatar.group); avatar = null;
  }
  var hh = $('huntHud'); if(hh) hh.hidden = (playAs !== 'hunter');
  var bh2 = $('botHud'); if(bh2 && playAs === 'hunter') bh2.hidden = true;
  // 頭は追う側のときだけ隠す（視界を塞ぐため）。戻したら必ず出す
  if(hunter.parts && hunter.parts.head) hunter.parts.head.visible = (playAs !== 'hunter');
  /* 体力もランプ残量も相手の情報なので隠す。拾う・息を止めるも追う側には無い。
     残すのはスティックと視点ドラッグ、それに一時停止だけ。 */
  var hunting = (playAs === 'hunter');
  ['vitals','objective'].forEach(function(id){
    var e = $(id); if(e) e.style.display = hunting ? 'none' : '';
  });
  ['bLight','bBack','bUse'].forEach(function(id){
    var e = $(id); if(e) e.style.display = hunting ? 'none' : '';
  });
  var bh = $('bHold'); if(bh && hunting) bh.style.display = 'none';
  var rt = $('reticle'); if(rt) rt.style.display = hunting ? 'none' : '';
}


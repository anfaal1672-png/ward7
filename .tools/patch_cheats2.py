import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# --- 身 ---
rep("""  player.sanity = clamp(player.sanity + (drainS>0 ? -drainS*dt : dt*3.2), 0, 100);""",
"""  if(cheats.noSanity) player.sanity = 100;
  else player.sanity = clamp(player.sanity + (drainS>0 ? -drainS*dt : dt*3.2), 0, 100);
  if(cheats.regen && player.hp < 100) player.hp = clamp(player.hp + dt*8, 0, 100);""", 'sanity')

# --- 隠 ---
rep("""    if(hd < (los ? hearOpen : hearWall)) heard = true;""",
"""    if(!cheats.silent && hd < (los ? hearOpen : hearWall)) heard = true;""", 'silent')
rep("""    if(canSee && player.lamp && hd < d.sight + 6){""",
"""    if(canSee && player.lamp && !cheats.noLampTell && hd < d.sight + 6){""", 'lamptell')
rep("""            player.hideSeen = true;""",
"""            if(!cheats.ghostHide) player.hideSeen = true;""", 'ghosthide')

# --- 敵 ---
rep("""      var spd = hunter.speed * (hunter.mode==='chase' ? d.chaseMul : (hunter.mode==='hunt'?1.05:0.82))""",
"""      var spd = (cheats.slowHunter ? 0.5 : 1) *
                hunter.speed * (hunter.mode==='chase' ? d.chaseMul : (hunter.mode==='hunt'?1.05:0.82))""", 'slow')
rep("""    hunter.memT = d.memory;           // 見失っても数秒は完全に追尾する""",
"""    hunter.memT = cheats.shortMem ? 0.25 : d.memory;   // 見失っても数秒は完全に追尾する""", 'mem')
rep("""  if(hd < 1.25 && noticed && hunter.attackCd <= 0 && hunter.stunT <= 0 &&""",
"""  if(!cheats.pacifist && hd < 1.25 && noticed && hunter.attackCd <= 0 && hunter.stunT <= 0 &&""", 'pacifist')
rep("""  if(world.endgame && hunter.spawnGrace <= 0 && !cheats.invisible && !seen){""",
"""  if(world.endgame && hunter.spawnGrace <= 0 && !cheats.invisible && !cheats.blindEnd && !seen){""", 'blindend')

# --- 眼 ---
rep("""  ambient.intensity = (0.46 - panic*0.14) * (world.power ? 1.7 : 1);""",
"""  ambient.intensity = (0.46 - panic*0.14) * (world.power ? 1.7 : 1) * (cheats.brightWorld ? 4.2 : 1);""", 'bright')

# --- 他：スローモーション・揺れ止め ---
rep("""  dt = Math.min(dt, 0.05);""",
"""  dt = Math.min(dt, 0.05);
  if(cheats.slowmo) dt *= 0.4;""", 'slowmo')
rep("""  postFX.aberr = lerp(postFX.aberr, T.aberr, k);""",
"""  if(cheats.noShake){ T.aberr = 0; T.noise = 0.01; T.scan = 0; T.warp = 0; player.shake = 0; }
  postFX.aberr = lerp(postFX.aberr, T.aberr, k);""", 'noshake')

# 視野と、壁越しの目印、内部表示は毎フレーム面倒を見る
rep("""  updateDust(dt);
  updateExitShaft(dt);""",
"""  updateCheatView(dt);
  updateDust(dt);
  updateExitShaft(dt);""", 'view-call')

rep("""function updateHUD(dt, bpm, info){""",
"""/* 見え方に関わるチートの面倒をまとめて見る。
   毎フレーム状態を合わせにいく（切り替えた瞬間に効いてほしいし、
   切ったときに元へ戻らないと「直らないバグ」に見える）。 */
var CV = { fov:0, marked:false };
function updateCheatView(dt){
  // 視野
  var wantFov = ((window.innerHeight > window.innerWidth) ? 78 : 70) + (cheats.wideView ? 22 : 0);
  if(state === STATE.PLAY && Math.abs(camera.fov - wantFov) > 0.01){
    camera.fov = lerp(camera.fov, wantFov, 1 - Math.pow(0.02, dt));
    camera.updateProjectionMatrix();
  }
  // 壁越しの目印。深度テストを切ると、壁の向こうでも描かれる
  var wantItems = !!cheats.markItems, wantHides = !!cheats.markHides;
  if(CV.items !== wantItems){
    CV.items = wantItems;
    var mark = function(sp){ if(!sp) return;
      sp.material.depthTest = !wantItems; sp.renderOrder = wantItems ? 12 : 0;
      sp.material.opacity = wantItems ? 0.9 : 0.55; sp.material.needsUpdate = true; };
    world.records.forEach(function(r){ mark(r.spr); });
    world.batteries.forEach(function(b){ mark(b.spr); });
    if(world.key) mark(world.key.spr);
  }
  if(CV.hides !== wantHides){
    CV.hides = wantHides;
    world.hides.forEach(function(h){
      if(!h.group) return;
      h.group.traverse(function(o){
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

function updateHUD(dt, bpm, info){""", 'view')
open(p,'w').write(s)
print('チートの効きを実装')

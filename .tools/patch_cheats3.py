import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# 一発もののチートを足す
rep("""  }else if(k === 'heal'){""",
"""  }else if(k === 'key'){
    if(world.key && !world.key.taken){
      world.key.taken = true;
      world.key.grp.visible = false; world.key.spr.visible = false;
    }
    player.hasKey = true;
    toast('鍵を手に入れた', 2);
  }else if(k === 'openDoor'){
    if(world.lockDoor && !world.lockDoor.open){
      world.lockDoor.open = true;
      if(world.lockDoor.group) world.lockDoor.group.visible = false;
      toast('施錠扉を開けた', 2);
    }else toast('開ける扉がない', 2);
  }else if(k === 'stun'){
    hunter.stunT = 10; hunter.swingT = 0;
    toast('追跡者を止めた', 2);
  }else if(k === 'teleHunter'){
    // 自分からいちばん遠い到達可能なマスへ飛ばす
    var far2 = null, fd = -1, reach2 = buildInfo && buildInfo.reach;
    if(reach2){
      for(var ti2=0; ti2<reach2.length; ti2++){
        var w3 = cellToWorld(reach2[ti2].x, reach2[ti2].y);
        var dd3 = (w3.x-player.x)*(w3.x-player.x) + (w3.z-player.z)*(w3.z-player.z);
        if(dd3 > fd){ fd = dd3; far2 = w3; }
      }
    }
    if(far2){
      hunter.x = far2.x; hunter.z = far2.z;
      hunter.target = null; hunter.lastSeen = null; hunter.memT = 0; hunter.mode = 'patrol';
      toast('追跡者を飛ばした（' + Math.round(Math.sqrt(fd)) + 'm 先）', 2);
    }
  }else if(k === 'battery'){
    world.batteries.forEach(function(q){
      if(q.taken) return;
      q.taken = true; q.mesh.visible = false; q.spr.visible = false;
    });
    player.battery = 100;
    toast('電池を全部集めた', 2);
  }else if(k === 'mapAll'){
    if(BOT.known){
      for(var mi=0; mi<BOT.known.length; mi++)
        BOT.known[mi] = (world.grid[mi] === 0) ? 1 : 2;
      toast('地図を全部知った', 2);
    }else toast('AI観戦モードでのみ使えます', 2);
  }else if(k === 'win'){
    toast('脱出した', 1.2); doWin();
  }else if(k === 'lose'){
    player.hp = 0; toast('力尽きた', 1.2); doDeath();
  }else if(k === 'heal'){""", 'acts')

# チートの一覧を節ごとに見せる
rep("""  CHEATS.forEach(function(c){""",
"""  var lastG = null;
  CHEATS.forEach(function(c){
    if(c.g && c.g !== lastG){
      lastG = c.g;
      var hd2 = document.createElement('div');
      hd2.className = 'sect';
      hd2.textContent = ({身:'自分', 隠:'見つからない', 速:'動き',
                          敵:'追跡者', 眼:'見え方', 他:'その他'})[c.g] || c.g;
      list.appendChild(hd2);
    }""", 'ui-group')
open(p,'w').write(s)
print('一発チートと一覧の節を追加')

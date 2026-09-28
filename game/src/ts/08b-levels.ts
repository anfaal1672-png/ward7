/* =========================================================================
   8b. レベルの上書き（設計指示書 第 6.4 節 レベル制作の道具）
   ========================================================================= */
/* 病棟そのものは種から作る。そこへ手で置く物だけを章ごとに重ねる：
     sound   … 音響領域（半径 r の中では返りの深さ space を 'box'|'room'|'hall' にする）
     trigger … 演出トリガー（半径 r に入ったら act を 1 回鳴らす。'stinger'|'creak'|'whisper'|'clang'|'toast'）
     patrol  … 巡回点（追跡者が徘徊の行き先に選ぶ。遊びが変わるので、置いた章はボットで測り直すこと）
     light   … 光源（見た目だけ。flicker で明滅）
   置き方は 2 通り。Blender でブロックアウトに空の物を置いて書き出す（.tools/blender/、.tools/level-import.js）か、
   ゲームの中の編集（?debug=1&edit=1、PC ブラウザ）で動かして保存する。どちらも game/src/levels/ch<N>.json になり、
   組み立て（build.mjs）が下の LEVELS に差し込む。座標はゲームの世界の x・z（m）。
   上書きの無い章は何も変わらない（乱数も引かない） */
var LEVELS: Record<string, any> = {};
var LV: any = { cur:null, key:'', fired:({} as Record<string, any>), lights:([] as any[]), mk:null, edit:false,
                sel:-1, cursor:false, drag:false, hit:null };
LV.edit = /[?&]debug=1/.test(location.search) && /[?&]edit=1/.test(location.search);

function levelKey(){ return RUN.ch >= 0 ? 'ch' + (RUN.ch + 1) : ''; }
/* 章に入るたびに呼ぶ（world.group は作り直されているので、灯りと印も作り直す） */
function levelLoad(){
  LV.key = levelKey(); LV.fired = {}; LV.lights = []; LV.mk = null; LV.sel = -1;
  var src = LV.key ? LEVELS[LV.key] : null;
  if(LV.edit && LV.key){
    try{ var saved = Store.get('ward7.level.' + LV.key); if(saved) src = JSON.parse(saved); }catch(e){}
  }
  LV.cur = src ? JSON.parse(JSON.stringify(src)) : (LV.edit && LV.key ? { items:[] } : null);
  if(!LV.cur) return;
  LV.cur.items = LV.cur.items || [];
  levelBuildLights();
  if(LV.edit) levelMarkers();
}
function levelBuildLights(){
  LV.lights.forEach(function(L: any){ if(L.parent) L.parent.remove(L); });
  LV.lights = [];
  LV.cur.items.forEach(function(it: any){
    if(it.kind !== 'light') return;
    var L = new THREE.PointLight(it.color != null ? it.color : 0xffe2b0, it.i != null ? it.i : 0.9, it.r || 7, 2);
    L.position.set(it.x, it.y != null ? it.y : 2.4, it.z);
    L.userData.it = it;
    world.group.add(L);
    LV.lights.push(L);
  });
}
/* 毎フレーム。音響領域は部屋の判定の後で上書きする（隠れている間は箱のまま） */
function levelUpdate(dt: number){
  if(!LV.cur) return;
  var items = LV.cur.items, now = performance.now()/1000;
  for(var i=0; i<items.length; i++){
    var it = items[i], d = Math.hypot(player.x - it.x, player.z - it.z);
    if(it.kind === 'sound'){
      if(!player.hiding && d < (it.r || 3)) Audio2.setSpace(it.space || 'room');
    }else if(it.kind === 'trigger'){
      var inside = d < (it.r || 2);
      if(inside && !LV.fired[i]){ LV.fired[i] = 1; levelFire(it, d); }
      if(!inside && it.once === false) LV.fired[i] = 0;
    }
  }
  LV.lights.forEach(function(L: any){
    var it = L.userData.it, base = it.i != null ? it.i : 0.9;
    L.intensity = it.flicker ? base * (Math.sin(now*23.1 + it.x) > -0.2 ? 1 : 0.15) * (0.8 + 0.2*Math.sin(now*3.7)) : base;
  });
  if(LV.edit) levelEditUpdate(dt);
}
function levelFire(it: any, d: number){
  var pan = 0;
  switch(it.act){
    case 'stinger': Audio2.stinger(); break;
    case 'creak':   Audio2.creak(); break;
    case 'whisper': Audio2.whisper(Math.max(1, d), pan); break;
    case 'clang':   Audio2.clang(8, pan, 1); break;
    case 'toast':   if(it.text) toast(it.text, 3); break;
  }
}
/* 巡回点を持つ章だけ、徘徊の行き先の半分をそこから選ぶ。持たない章では乱数を引かない */
function levelPatrolPick(){
  if(!LV.cur) return null;
  var pts = LV.cur.items.filter(function(it: any){ return it.kind === 'patrol'; });
  if(!pts.length || rndAI() < 0.5) return null;
  var p = pts[(rndAI()*pts.length)|0];
  return worldToCell(p.x, p.z);
}

/* ---- ゲームの中の編集（開発用・PC ブラウザ） ----
   M：カーソルの出し入れ（視点の操作と切り替え）。カーソルで印を掴んで床の上を動かす。
   1 音響 / 2 演出 / 3 巡回点 / 4 光源 を、カーソルの下（カーソルが無ければ足元）に置く。
   Delete で消す、[ ] で半径、K で保存（ブラウザに残し、JSON を書き出す）。
   保存した物は次に同じ章へ入ったときに読み直される */
var LV_COL = ({ sound:0x4aa0ff, trigger:0xff5a4a, patrol:0x6aff7a, light:0xffd24a } as Record<string, any>);
function levelMarkers(){
  if(LV.mk && LV.mk.parent) LV.mk.parent.remove(LV.mk);
  LV.mk = new THREE.Group();
  LV.cur.items.forEach(function(it: any, i: number){
    var g = new THREE.Group(), col = LV_COL[it.kind] || 0xffffff, selC = (i === LV.sel) ? 0xffffff : col;
    var mat = new THREE.MeshBasicMaterial({ color:selC, transparent:true, opacity:0.55, depthWrite:false });
    var pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.2, 8), mat);
    pole.position.y = 1.1; g.add(pole);
    if(it.kind === 'sound' || it.kind === 'trigger'){
      var r = it.r || (it.kind === 'sound' ? 3 : 2);
      var ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.06, r, 40), mat);
      ring.rotation.x = -Math.PI/2; ring.position.y = 0.03; g.add(ring);
    }
    g.position.set(it.x, 0, it.z);
    LV.mk.add(g);
  });
  world.group.add(LV.mk);
  var hud = $('lvEdit');
  if(!hud){
    hud = document.createElement('div'); hud.id = 'lvEdit';
    hud.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:50;font:11px/1.5 ui-monospace,monospace;color:#cfe;background:rgba(0,0,0,.6);padding:6px 8px;pointer-events:none;white-space:pre';
    document.body.appendChild(hud);
  }
  hud.textContent = 'EDIT ' + LV.key + '  ' + LV.cur.items.length + ' 個' + (LV.sel >= 0 ? '  選択 #' + LV.sel + ' ' + LV.cur.items[LV.sel].kind : '') +
    '\nM カーソル  1 音響 2 演出 3 巡回 4 光源  Del 消す  [ ] 半径  K 保存';
}
var _lvRay = new THREE.Raycaster(), _lvPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), _lvHit = new THREE.Vector3();
function levelFloorAt(cx: number, cy: number){
  var r = canvas.getBoundingClientRect();
  _lvRay.setFromCamera(new THREE.Vector2((cx - r.left)/r.width*2 - 1, -((cy - r.top)/r.height)*2 + 1), camera);
  return _lvRay.ray.intersectPlane(_lvPlane, _lvHit) ? { x:_lvHit.x, z:_lvHit.z } : null;
}
function levelAdd(kind: string, x: number, z: number){
  var it: any = { kind:kind, x:+x.toFixed(2), z:+z.toFixed(2) };
  if(kind === 'sound'){ it.r = 3; it.space = 'hall'; }
  if(kind === 'trigger'){ it.r = 2; it.act = 'whisper'; }
  if(kind === 'light'){ it.i = 0.9; it.flicker = true; }
  LV.cur.items.push(it); LV.sel = LV.cur.items.length - 1;
  if(kind === 'light') levelBuildLights();
  levelMarkers();
  return LV.sel;
}
function levelMove(i: number, x: number, z: number){
  var it = LV.cur.items[i]; if(!it) return;
  it.x = +x.toFixed(2); it.z = +z.toFixed(2);
  if(it.kind === 'light') levelBuildLights();
  levelMarkers();
}
function levelSave(){
  var json = JSON.stringify({ items:LV.cur.items }, null, 1);
  try{ Store.set('ward7.level.' + LV.key, json); }catch(e){}
  try{
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json + '\n'], { type:'application/json' }));
    a.download = LV.key + '.json'; a.click();
  }catch(e){}
  toast('保存した：' + LV.key + '.json', 2);
  return json;
}
function levelEditUpdate(dt: number){ /* 印は動かしたときだけ作り直す。ここでは何もしない */ }
if(LV.edit){
  document.addEventListener('keydown', function(e){
    if(!LV.cur || state !== STATE.PLAY) return;
    var at = LV.hit || { x:player.x, z:player.z };
    var map = ({ Digit1:'sound', Digit2:'trigger', Digit3:'patrol', Digit4:'light' } as Record<string, any>);
    if(e.code === 'KeyM'){ LV.cursor = !LV.cursor; if(LV.cursor && document.exitPointerLock) document.exitPointerLock(); e.stopPropagation(); }
    else if(map[e.code]){ levelAdd(map[e.code], at.x, at.z); e.stopPropagation(); }
    else if((e.code === 'Delete' || e.code === 'Backspace') && LV.sel >= 0){
      var k = LV.cur.items[LV.sel].kind; LV.cur.items.splice(LV.sel, 1); LV.sel = -1;
      if(k === 'light') levelBuildLights(); levelMarkers(); e.stopPropagation();
    }
    else if((e.code === 'BracketLeft' || e.code === 'BracketRight') && LV.sel >= 0){
      var s = LV.cur.items[LV.sel]; s.r = Math.max(0.5, (s.r || 2) + (e.code === 'BracketRight' ? 0.5 : -0.5)); levelMarkers(); e.stopPropagation();
    }
    else if(e.code === 'KeyK'){ levelSave(); e.stopPropagation(); }
  }, true);
  canvas.addEventListener('mousedown', function(e: MouseEvent){
    if(!LV.cur || !LV.cursor) return;
    var p = levelFloorAt(e.clientX, e.clientY); if(!p) return;
    var best = -1, bd = 1.2;
    LV.cur.items.forEach(function(it: any, i: number){ var d = Math.hypot(it.x - p.x, it.z - p.z); if(d < bd){ bd = d; best = i; } });
    LV.sel = best; LV.drag = best >= 0; levelMarkers();
    e.stopImmediatePropagation();
  }, true);
  // カーソルを出している間は、クリックで視点の固定（ポインタロック）に戻らないようにする
  canvas.addEventListener('click', function(e: MouseEvent){ if(LV.cursor) e.stopImmediatePropagation(); }, true);
  window.addEventListener('mousemove', function(e: MouseEvent){
    if(!LV.cur || !LV.cursor) return;
    LV.hit = levelFloorAt(e.clientX, e.clientY);
    if(LV.drag && LV.hit) levelMove(LV.sel, LV.hit.x, LV.hit.z);
  });
  window.addEventListener('mouseup', function(){ LV.drag = false; });
}

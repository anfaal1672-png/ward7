/* =========================================================================
   17b. 状態の保存と巻き戻し（設計指示書 第 15.3 節「保存・読み込み・巻き戻し（開発用）」）
   =========================================================================
   遊びの状態は章ごとの変数に散っている（player・hunter・world・BOT…）。ここでは
   「状態を持つもの」の一覧（SNAP_ROOTS と下の数の一覧）を 1 か所に集め、three の物・
   音の節・画面の要素は飛ばして、素の値だけを写し取る。戻すときは今ある物へ値を書き戻す
   （メッシュなどの参照はそのまま残る）。world の配列（隠れ場所・カルテなど）の要素を指す
   参照は、配列の名前と番号にして持つ。

   確かめ方：途中で取って 20 秒進めた結果と、戻して同じだけ進めた結果が 1 本残らず同じ
   になること（snap-check.js）。写し漏れがあればそこで食い違う。

   ?debug=1 のとき F8 で取り、F9 で戻す（開発用。製品の画面には出さない）。 */
var SNAP_REG = ['hides', 'records', 'batteries', 'bottles', 'bandages', 'props', 'rooms', 'lamps', 'reach'];
/* reach（歩けるマスの一覧）は world ではなく buildInfo にある。巡回先はこの要素そのものを指す */
function snapArr(/** @type {any} */ name){ return name === 'reach' ? (buildInfo ? buildInfo.reach : null) : world[name]; }
function snapRoots(){
  return { player:player, hunter:hunter, world:world, DIRECTOR:DIRECTOR, shade:shade, PATHF:PATHF,
           BOT:BOT, HINT:HINT, TIPS:TIPS, MAPV:MAPV, CUE:CUE, PEEK:PEEK, HANDL:HANDL, input:input,
           patients:patients, vents:vents, throws:throws, BEAM:BEAM, HUDW:HUDW, RUN:RUN };
}
function snapSkip(/** @type {any} */ v){
  return !!(v && (v.isObject3D || v.isMaterial || v.isTexture || v.isBufferGeometry || v.isRenderTarget ||
               (typeof AudioNode !== 'undefined' && v instanceof AudioNode) ||
               (typeof v.nodeType === 'number' && typeof v.nodeName === 'string')));
}
function snapRefIndex(){
  var m = new Map();
  SNAP_REG.forEach(function(name){ (snapArr(name) || []).forEach(function(/** @type {any} */ o, /** @type {any} */ i){ if(o && typeof o === 'object') m.set(o, [name, i]); }); });
  return m;
}
function snapVal(/** @type {any} */ v, /** @type {any} */ refs, /** @type {any} */ depth, /** @type {any} */ home){
  if(v === null || typeof v !== 'object') return (typeof v === 'function') ? { $skip:1 } : v;
  if(snapSkip(v)) return { $skip:1 };
  if(depth > 10) return { $skip:1 };
  if(!home && refs.has(v)) return { $ref:refs.get(v) };
  if(ArrayBuffer.isView(v)) return { $ta:Array.prototype.slice.call(v), $k:v.constructor.name };
  if(v instanceof Map || v instanceof Set) return { $skip:1 };
  if(Array.isArray(v)) return v.map(function(/** @type {any} */ e){ return snapVal(e, refs, depth + 1, false); });
  var o = {};
  for(var k in v){ if(Object.prototype.hasOwnProperty.call(v, k)) o[k] = snapVal(v[k], refs, depth + 1, false); }
  return o;
}
function snapTake(){
  var refs = snapRefIndex(), R = snapRoots(), out = { roots:{}, reg:{}, n:{} };
  Object.keys(R).forEach(function(k){ out.roots[k] = snapVal(R[k], refs, 0, true); });
  // world の配列の要素そのもの（ここだけは参照にせず中身を持つ）
  SNAP_REG.forEach(function(name){ out.reg[name] = (snapArr(name) || []).map(function(/** @type {any} */ o){ return snapVal(o, refs, 1, true); }); });
  out.n = { toastT:toastT, noteT:noteT, lampFlick:lampFlick, ambientCreakT:ambientCreakT, heartT:heartT,
            voxPrevMode:voxPrevMode, voxT:voxT, voxIdleT:voxIdleT, botRndState:botRndState, botLookState:botLookState,
            simAcc:simAcc, state:state, cheatUsed:cheatUsed,
            rnd:rnd.getState(), rndAI:rndAI.getState(), rndFx:rndFx.getState() };
  return JSON.stringify(out);
}
function snapResolve(/** @type {any} */ s, /** @type {any} */ refs){
  if(s && typeof s === 'object' && s.$ref){ var a = snapArr(s.$ref[0]); return a ? a[s.$ref[1]] : null; }
  if(s && typeof s === 'object' && s.$ta){ var C = /** @type {any} */ (window[s.$k] || Float32Array); return new C(s.$ta); }
  if(Array.isArray(s)) return s.map(function(e){ return snapResolve(e, refs); });
  if(s && typeof s === 'object'){ var o = {}; for(var k in s) if(!(s[k] && s[k].$skip)) o[k] = snapResolve(s[k], refs); return o; }
  return s;
}
/* 今ある物 t へ写しの値 s を書き戻す。飛ばした物（$skip）は触らない。写しに無い鍵は消す
   （取った後に増えた印が残ると、戻した先で展開が変わる） */
function snapInto(/** @type {any} */ t, /** @type {any} */ s){
  if(Array.isArray(s)){
    if(!Array.isArray(t)) return snapResolve(s);
    for(var i=0; i<s.length; i++){
      var sv = s[i];
      if(sv && typeof sv === 'object' && !sv.$ref && !sv.$ta && !sv.$skip && t[i] && typeof t[i] === 'object' && !snapSkip(t[i])) t[i] = snapInto(t[i], sv);
      else if(!(sv && sv.$skip)) t[i] = snapResolve(sv);
    }
    t.length = s.length;
    return t;
  }
  if(!t || typeof t !== 'object' || snapSkip(t)) return snapResolve(s);
  for(var k in t){
    if(!Object.prototype.hasOwnProperty.call(t, k)) continue;
    if(!(k in s) && typeof t[k] !== 'function' && !snapSkip(t[k])) delete t[k];
  }
  for(var k2 in s){
    var v = s[k2];
    if(v && v.$skip) continue;
    if(v && typeof v === 'object' && !v.$ref && !v.$ta){
      if(t[k2] && typeof t[k2] === 'object' && !snapSkip(t[k2]) && (Array.isArray(t[k2]) === Array.isArray(v))) t[k2] = snapInto(t[k2], v);
      else t[k2] = snapResolve(v);
    }else if(v && v.$ta && t[k2] && ArrayBuffer.isView(t[k2]) && t[k2].length === v.$ta.length){ t[k2].set(v.$ta); }
    else t[k2] = snapResolve(v);
  }
  return t;
}
function snapRestore(/** @type {any} */ json){
  var S = typeof json === 'string' ? JSON.parse(json) : json;
  SNAP_REG.forEach(function(name){ var a = snapArr(name); if(a && S.reg[name]) snapInto(a, S.reg[name]); });
  var R = snapRoots();
  Object.keys(S.roots).forEach(function(k){ snapInto(R[k], S.roots[k]); });
  var n = S.n;
  toastT = n.toastT; noteT = n.noteT; lampFlick = n.lampFlick; ambientCreakT = n.ambientCreakT; heartT = n.heartT;
  voxPrevMode = n.voxPrevMode; voxT = n.voxT; voxIdleT = n.voxIdleT; botRndState = n.botRndState; botLookState = n.botLookState;
  simAcc = n.simAcc; state = n.state; cheatUsed = n.cheatUsed;
  rnd.setState(n.rnd); rndAI.setState(n.rndAI); rndFx.setState(n.rndFx);
  // 見た目を値に合わせる（拾った物は消し、扉は開けたなら消す）
  ['records', 'batteries', 'bottles', 'bandages'].forEach(function(name){
    (world[name] || []).forEach(function(/** @type {any} */ o){ var vis = !o.taken; if(o.grp) o.grp.visible = vis; if(o.mesh) o.mesh.visible = vis; if(o.spr) o.spr.visible = vis; });
  });
  if(world.key && world.key.grp){ world.key.grp.visible = !world.key.taken; if(world.key.spr) world.key.spr.visible = !world.key.taken; }
  if(world.lockDoor && world.lockDoor.group) world.lockDoor.group.visible = !world.lockDoor.open;
}
var SNAP_SLOT = /** @type {any} */ (null);
if(DEBUG){
  document.addEventListener('keydown', function(e){
    if(state !== STATE.PLAY && state !== STATE.PAUSE) return;
    if(e.code === 'F8'){ SNAP_SLOT = snapTake(); toast('状態を取った（F9 で戻す）', 1.6); e.preventDefault(); }
    if(e.code === 'F9' && SNAP_SLOT){ snapRestore(SNAP_SLOT); toast('状態を戻した', 1.6); e.preventDefault(); }
  });
}

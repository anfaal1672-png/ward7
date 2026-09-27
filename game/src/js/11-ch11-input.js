/* =========================================================================
   11. 入力
   ========================================================================= */
var input = {
  fwd:0, side:0, lookX:0, lookY:0,
  run:false, use:false, toggleLamp:false,
  keys:{}
};
/* 追う側モードでは、人間とボットが同じ input を奪い合う。
   ボットは input.keys を毎フレーム上書きするので、人間の WASD は消える。
   そこで人間ぶんだけ別に控える（スティックも同様）。
   逃げる側モードでは使わない。 */
var humanKeys = {}, stickIn = { fwd:0, side:0, run:false };

var pointers = {};   // id -> {mode, sx, sy, x, y}
var stickEl = $('stick'), stickKnob = stickEl.querySelector('i');
var stickId = null, lookId = null, stickRunning = false, holdBtnDown = false, backBtnDown = false;
var stickOrigin = {x:0,y:0};

/* スティックの効き。指を倒した割合 v(0..1) を速度の割合に写す。
   中央の 12% は死に帯（親指を置いただけで歩き出さない）。
   そこから先は v^1.55 でゆっくり立ち上げ、外側でちょうど 1 に届く。
   自己診断から呼べるように関数に出してある（端が 1 に届かないと
   全力疾走が出なくなり、追跡者に必ず捕まる）。 */
function stickCurve(v){
  v = clamp(v, 0, 1);
  var dead = 0.12;
  if(v <= dead) return 0;
  return Math.pow((v - dead) / (1 - dead), 1.55);
}

function setStickVisual(on, ox, oy, dx, dy){
  if(on){
    stickEl.style.left = ox+'px'; stickEl.style.top = oy+'px';
    stickEl.classList.add('on');
    stickKnob.style.transform = 'translate('+dx+'px,'+dy+'px)';
  }else{
    stickEl.classList.remove('on');
    stickEl.classList.remove('run');
    stickRunning = false;
    stickKnob.style.transform = 'translate(0,0)';
  }
}

function onPointerDown(e){
  if(state !== STATE.PLAY) return;
  if(e.target && e.target.classList && e.target.classList.contains('tbtn')) return;
  if(e.target && e.target.id === 'bPause') return;
  if(e.pointerType === 'mouse'){
    if(pointerLocked) return;
    if(lookId === null){ lookId = e.pointerId; pointers[e.pointerId] = { x:e.clientX, y:e.clientY }; }
    return;
  }
  var half = window.innerWidth/2;
  if(e.clientX < half && stickId === null){
    stickId = e.pointerId;
    stickOrigin.x = e.clientX; stickOrigin.y = e.clientY;
    setStickVisual(true, e.clientX, e.clientY, 0, 0);
  }else if(lookId === null){
    lookId = e.pointerId;
    pointers[e.pointerId] = { x:e.clientX, y:e.clientY };
  }
}
function onPointerMove(e){
  if(state !== STATE.PLAY) return;
  if(e.pointerId === stickId){
    var dx = e.clientX - stickOrigin.x, dy = e.clientY - stickOrigin.y;
    var max = 56;
    var len = Math.sqrt(dx*dx+dy*dy);
    if(len > max){ dx = dx/len*max; dy = dy/len*max; len = max; }
    setStickVisual(true, stickOrigin.x, stickOrigin.y, dx, dy);
    /* 入力の曲線。これまで指の位置をそのまま速度にしていたので、
       中央付近が効きすぎて「そっと寄る」ができなかった。
       中央を寝かせ、外側で 1 に届く曲線を通す。向きは変えず大きさだけ。
       走り出す判定は指の生の位置で見る（曲線を通すと走り出しがずれる）。 */
    var mag = stickCurve(len / max);
    var ux = len > 0.0001 ? dx/len : 0, uy = len > 0.0001 ? dy/len : 0;
    input.side = ux * mag;
    input.fwd  = -uy * mag;
    stickIn.side = input.side; stickIn.fwd = input.fwd;
    var wantRunNow = (len > max*0.78) && (-dy/max) > 0.25;   // 前方向に大きく倒したときだけ
    if(wantRunNow !== stickRunning){
      stickRunning = wantRunNow;
      stickEl.classList.toggle('run', wantRunNow);
      if(wantRunNow) haptic(12);
    }
    input.run = wantRunNow;
    stickIn.run = wantRunNow;
  }else if(e.pointerId === lookId){
    var p = pointers[e.pointerId];
    if(!p) return;
    var mx = e.clientX - p.x, my = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    input.lookX += mx * 0.0042 * settings.sens;
    input.lookY += my * 0.0042 * settings.sens * (settings.invert ? -1 : 1);
  }
}
function onPointerUp(e){
  if(e.pointerId === stickId){
    stickId = null; input.fwd = 0; input.side = 0; input.run = false;
    stickIn.fwd = 0; stickIn.side = 0; stickIn.run = false;
    setStickVisual(false);
  }
  if(e.pointerId === lookId){ lookId = null; delete pointers[e.pointerId]; }
}
window.addEventListener('pointerdown', onPointerDown, {passive:true});
window.addEventListener('pointermove', onPointerMove, {passive:true});
window.addEventListener('pointerup', onPointerUp, {passive:true});
window.addEventListener('pointercancel', onPointerUp, {passive:true});
document.addEventListener('touchmove', function(e){
  // メニュー画面は縦スクロールを許可する（ゲーム中は画面が無いので影響なし）
  var t = e.target;
  while(t && t !== document.body){
    if(t.classList && t.classList.contains('panel')) return;
    t = t.parentNode;
  }
  if(e.cancelable) e.preventDefault();
}, {passive:false});
document.addEventListener('gesturestart', function(e){ e.preventDefault(); });
document.addEventListener('contextmenu', function(e){ e.preventDefault(); });

// --- デスクトップ ---
var pointerLocked = false;
document.addEventListener('pointerlockchange', function(){
  pointerLocked = (document.pointerLockElement === canvas);
});
canvas.addEventListener('click', function(){
  if(state === STATE.PLAY && !pointerLocked && canvas.requestPointerLock){
    try{ var pr = canvas.requestPointerLock(); if(pr && pr.catch) pr.catch(function(){}); }catch(err){}
  }
});
document.addEventListener('mousemove', function(e){
  if(state !== STATE.PLAY || !pointerLocked) return;
  input.lookX += e.movementX * 0.0022 * settings.sens;
  input.lookY += e.movementY * 0.0022 * settings.sens * (settings.invert ? -1 : 1);
});
var KEYMAP = { KeyW:'f', ArrowUp:'f', KeyS:'b', ArrowDown:'b', KeyA:'l', ArrowLeft:'l', KeyD:'r', ArrowRight:'r' };
document.addEventListener('keydown', function(e){
  if(e.repeat) return;
  input.keys[e.code] = true; humanKeys[e.code] = true;
  if(e.code === 'KeyF') toggleLamp();
  if(e.code === 'KeyG') throwBottle();
  if(e.code === 'KeyE' || e.code === 'Space'){ input.use = true; if(e.code==='Space') e.preventDefault(); }
  if(e.code === 'Escape'){ if(state===STATE.PLAY) doPause(); else if(state===STATE.PAUSE) doResume(); }
  if(KEYMAP[e.code]) e.preventDefault();
});
document.addEventListener('keyup', function(e){ input.keys[e.code] = false; humanKeys[e.code] = false; });

function readKeys(){
  /* 追う側モードでは、スティックは追跡者のもの。逃げる側はボットが
     キーで動かすので、スティックを握っていてもキーを読む。 */
  if(IS_TOUCH && stickId !== null && playAs !== 'hunter') return;
  var k = input.keys;
  var f = (k.KeyW||k.ArrowUp?1:0) - (k.KeyS||k.ArrowDown?1:0);
  var s = (k.KeyD||k.ArrowRight?1:0) - (k.KeyA||k.ArrowLeft?1:0);
  if(f||s||!IS_TOUCH){ input.fwd = f; input.side = s; }
  input.run = !!(k.ShiftLeft || k.ShiftRight);
  readPad();
}

/* --- ゲームパッド（設計指示書 第 12.2 節） ------------------------------
   iOS は MFi・Xbox・DualSense を標準で読める。標準配置（mapping 'standard'）で
     左スティック＝移動  右スティック＝視点
     A＝使う／隠れる  X＝ランプ  RB＝投げる  LB＝後ろを見る  B＝息を止める
     LT＝忍び足  RT・L3＝走る  Start＝一時停止
   ボタンは押した瞬間だけ拾う（押しっぱなしで連打にならないように）。
   スティックの遊びは 0.15、その外側を 0..1 に引き直してから曲線を通す。 */
var PAD_DEAD = 0.15;
var padPrev = [];
var pad = { back:false, hold:false, sneak:false, active:false, t:0 };
function padAxis(v){
  var a = Math.abs(v);
  if(a < PAD_DEAD) return 0;
  return Math.sign(v) * (a - PAD_DEAD) / (1 - PAD_DEAD);
}
function readPad(){
  pad.back = pad.hold = pad.sneak = false;
  if(!navigator.getGamepads) return;
  var list = navigator.getGamepads(), gp = null;
  for(var i=0; i<list.length; i++){ if(list[i] && list[i].connected){ gp = list[i]; break; } }
  if(!gp){ pad.active = false; pad.t = 0; return; }
  var ax = gp.axes, bt = gp.buttons;
  function down(n){ return !!(bt[n] && (bt[n].pressed || bt[n].value > 0.5)); }
  function edge(n){ var d = down(n), was = !!padPrev[n]; padPrev[n] = d; return d && !was; }
  var mx = padAxis(ax[0] || 0), my = padAxis(ax[1] || 0);
  var lx = padAxis(ax[2] || 0), ly = padAxis(ax[3] || 0);
  var used = mx || my || lx || ly;
  for(var b=0; b<bt.length; b++) if(down(b)) used = true;
  if(used) pad.active = true;
  if(!pad.active) return;
  if(mx || my){ input.fwd = -my; input.side = mx; }
  /* 視点は経過時間に掛ける（フレームに掛けると端末の速さで回り方が変わる）。
     最大に倒して感度 1 で、横に 1 秒 2.4 ラジアン、縦に 1.8 ラジアン */
  var now = performance.now(), pdt = clamp((now - (pad.t || now)) / 1000, 0, 0.1);
  pad.t = now;
  input.lookX += lx * 2.4 * pdt * settings.sens;
  input.lookY += ly * 1.8 * pdt * settings.sens * (settings.invert ? -1 : 1);
  if(down(7) || down(10)) input.run = true;
  pad.sneak = down(6);
  pad.back = down(4);
  pad.hold = down(1);
  if(edge(0)) input.use = true;
  if(edge(2)) toggleLamp();
  if(edge(5)) throwBottle();
  if(edge(9)){ if(state === STATE.PLAY) doPause(); else if(state === STATE.PAUSE) doResume(); }
}

// --- タッチボタン ---
function bindHold(el, onDown, onUp){
  el.addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    el.addEventListener(ev, function(e){ e.stopPropagation(); if(onUp) onUp(); });
  });
}
$('bLight').addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); toggleLamp(); }, {passive:false});
bindHold($('bHold'),
  function(){ holdBtnDown = true; },
  function(){ holdBtnDown = false; });
bindHold($('bBack'),
  function(){ backBtnDown = true; },
  function(){ backBtnDown = false; });
$('bUse').addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); input.use = true; }, {passive:false});
$('bThrow').addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); throwBottle(); }, {passive:false});
$('bPause').addEventListener('pointerdown', function(e){ e.preventDefault(); e.stopPropagation(); if(state===STATE.PLAY) doPause(); }, {passive:false});

function toggleLamp(){
  if(state !== STATE.PLAY) return;
  if(player.battery <= 0 && !player.lamp){ toast('電池切れ', 1.4); return; }
  player.lamp = !player.lamp;
  Audio2.click(player.lamp);
  $('bLight').classList.toggle('hot', player.lamp);
}


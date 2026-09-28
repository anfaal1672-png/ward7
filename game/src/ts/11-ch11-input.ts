/* =========================================================================
   11. 入力
   ========================================================================= */
var input: Record<string, any> = {
  fwd:0, side:0, lookX:0, lookY:0,
  run:false, use:false, toggleLamp:false,
  keys:{}
};
/* 追う側モードでは、人間とボットが同じ input を奪い合う。
   ボットは input.keys を毎フレーム上書きするので、人間の WASD は消える。
   そこで人間ぶんだけ別に控える（スティックも同様）。
   逃げる側モードでは使わない。 */
var humanKeys = ({} as Record<string, any>), stickIn = { fwd:0, side:0, run:false };

var pointers = ({} as Record<string, any>);   // id -> {mode, sx, sy, x, y}
var stickEl = $('stick'), stickKnob = stickEl.querySelector('i');
var stickId = (null as any), lookId = (null as any), stickRunning = false, holdBtnDown = false, backBtnDown = false;
var stickOrigin = {x:0,y:0};

/* スティックの効き。指を倒した割合 v(0..1) を速度の割合に写す。
   中央の 12% は死に帯（親指を置いただけで歩き出さない）。
   そこから先は v^1.55 でゆっくり立ち上げ、外側でちょうど 1 に届く。
   自己診断から呼べるように関数に出してある（端が 1 に届かないと
   全力疾走が出なくなり、追跡者に必ず捕まる）。 */
function stickCurve(v: any){
  v = clamp(v, 0, 1);
  var dead = 0.12;
  if(v <= dead) return 0;
  return Math.pow((v - dead) / (1 - dead), 1.55);
}

function setStickVisual(on: any, ox?: any, oy?: any, dx?: number, dy?: any){
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

function onPointerDown(e: any){
  if(e.pointerType === 'touch') lastInputKind = 'touch';
  else if(e.pointerType === 'mouse' && lastInputKind === 'touch') lastInputKind = 'kb';
  if(state !== STATE.PLAY) return;
  if(e.target && e.target.classList && e.target.classList.contains('tbtn')) return;
  if(e.target && e.target.id === 'bPause') return;
  if(e.pointerType === 'mouse'){
    if(pointerLocked) return;
    if(lookId === null){ lookId = e.pointerId; pointers[e.pointerId] = { x:e.clientX, y:e.clientY }; }
    return;
  }
  var half = window.innerWidth/2;
  var stickSide = settings.lefty ? (e.clientX >= half) : (e.clientX < half);   // 左手持ちでは右半分がスティック
  if(stickSide && stickId === null){
    stickId = e.pointerId;
    stickOrigin.x = e.clientX; stickOrigin.y = e.clientY;
    setStickVisual(true, e.clientX, e.clientY, 0, 0);
  }else if(lookId === null){
    lookId = e.pointerId;
    pointers[e.pointerId] = { x:e.clientX, y:e.clientY };
  }
}
function onPointerMove(e: any){
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
function onPointerUp(e: any){
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
  var t = (e.target as any);
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
/* キーの割り当て（設計指示書 第 12.3 節）。
   遊びの側（とボット）は「その操作の決まったキー」（KEYACT の canon）が押されているかだけを見る。
   実際に押されたキーは、ここで割り当てを引いて canon に写す。だから割り当てを変えても
   遊びの側は何も変えなくてよい。各操作は主キー 1 つ（変えられる）と、控えのキー（矢印など）を持つ。
   Esc（一時停止）は変えられない */
var KEYACT = [
  { a:'fwd',   canon:'KeyW',      alt:['ArrowUp'],    label:'前へ' },
  { a:'back',  canon:'KeyS',      alt:['ArrowDown'],  label:'後ろへ' },
  { a:'left',  canon:'KeyA',      alt:['ArrowLeft'],  label:'左へ' },
  { a:'right', canon:'KeyD',      alt:['ArrowRight'], label:'右へ' },
  { a:'run',   canon:'ShiftLeft', alt:['ShiftRight'], label:'走る・息を止める' },
  { a:'sneak', canon:'KeyZ',      alt:['ControlLeft'],label:'忍び足' },
  { a:'use',   canon:'KeyE',      alt:['Space'],      label:'使う・隠れる' },
  { a:'lamp',  canon:'KeyF',      alt:[],             label:'ランプ' },
  { a:'throw', canon:'KeyG',      alt:[],             label:'瓶を投げる' },
  { a:'peek',  canon:'KeyX',      alt:[],             label:'覗く' },
  { a:'look',  canon:'KeyQ',      alt:['KeyC'],       label:'振り返る' }
];
var KEYACT_BY = ({} as Record<string, any>);
KEYACT.forEach(function(k){ KEYACT_BY[k.a] = k; });
/* 実キー → canon の表。割り当てを変えたら作り直す */
var KEYMAP = ({} as Record<string, any>);
function keyOf(a: any){ var k = KEYACT_BY[a]; return (settings.keys && settings.keys[a]) || k.canon; }
function rebuildKeymap(){
  KEYMAP = {};
  KEYACT.forEach(function(k){
    var main = keyOf(k.a);
    KEYMAP[main] = k.canon;
    k.alt.forEach(function(c){ if(!KEYMAP[c]) KEYMAP[c] = k.canon; });
  });
  /* 主キーを別のキーに替えた操作の元のキー（canon）は、他の主キーでない限り何もしない。
     そのままだと未登録のキーは自分自身として読まれ、F を L に替えても F が効き続けた */
  KEYACT.forEach(function(k){ if(keyOf(k.a) !== k.canon && !KEYMAP[k.canon]) KEYMAP[k.canon] = '_'; });
  // 主キーに取られた控えは外す（主キーが優先）
  KEYACT.forEach(function(k){ KEYMAP[keyOf(k.a)] = k.canon; });
}
function keyLabel(code: any){
  if(!code) return '—';
  if(/^Key[A-Z]$/.test(code)) return code.slice(3);
  if(/^Digit[0-9]$/.test(code)) return code.slice(5);
  return (({ ShiftLeft:'Shift', ShiftRight:'右Shift', ControlLeft:'Ctrl', ControlRight:'右Ctrl', AltLeft:'Alt', AltRight:'右Alt',
            Space:'Space', Tab:'Tab', Enter:'Enter', ArrowUp:'↑', ArrowDown:'↓', ArrowLeft:'←', ArrowRight:'→',
            CapsLock:'Caps', Backquote:'`', Minus:'-', Equal:'=', BracketLeft:'[', BracketRight:']', Semicolon:';',
            Quote:"'", Comma:',', Period:'.', Slash:'/', Backslash:'\\' } as Record<string, any>))[code] || code;
}
rebuildKeymap();
var keyCapture = (null as any);                // 設定画面で「キーを押す」を待っている操作
document.addEventListener('keydown', function(e){
  if(keyCapture){ e.preventDefault(); var kc = keyCapture; keyCapture = null; kc(e.code); return; }
  if(e.repeat) return;
  if(e.code === 'Escape'){ if(state===STATE.PLAY) doPause(); else if(state===STATE.PAUSE) doResume(); return; }
  var c = KEYMAP[e.code] || e.code;
  input.keys[c] = true; humanKeys[c] = true;
  if(c === 'KeyF') toggleLamp();
  if(c === 'KeyG') throwBottle();
  if(c === 'KeyX') PEEK.want = true;
  if(c === 'KeyE'){ input.use = true; }
  if(KEYMAP[e.code]) e.preventDefault();
  lastInputKind = 'kb';
});
document.addEventListener('keyup', function(e){
  var c = KEYMAP[e.code] || e.code;
  input.keys[c] = false; humanKeys[c] = false;
  if(c === 'KeyX') PEEK.want = false; });
/* いま使っている入力機器（操作説明の出し分け。第 11.4 節）：'touch' | 'kb' | 'pad' */
var lastInputKind = IS_TOUCH ? 'touch' : 'kb';

function readKeys(dt: number){
  /* 追う側モードでは、スティックは追跡者のもの。逃げる側はボットが
     キーで動かすので、スティックを握っていてもキーを読む。 */
  if(IS_TOUCH && stickId !== null && playAs !== 'hunter') return;
  var k = input.keys;
  var f = (k.KeyW||k.ArrowUp?1:0) - (k.KeyS||k.ArrowDown?1:0);
  var s = (k.KeyD||k.ArrowRight?1:0) - (k.KeyA||k.ArrowLeft?1:0);
  if(f||s||!IS_TOUCH){ input.fwd = f; input.side = s; }
  input.run = !!(k.ShiftLeft || k.ShiftRight);
  readPad(dt);
}

/* --- ゲームパッド（設計指示書 第 12.2 節） ------------------------------
   iOS は MFi・Xbox・DualSense を標準で読める。標準配置（mapping 'standard'）で
     左スティック＝移動  右スティック＝視点
     A＝使う／隠れる  X＝ランプ  RB＝投げる  LB＝後ろを見る  B＝息を止める
     LT＝忍び足  RT・L3＝走る  Start＝一時停止
   ボタンは押した瞬間だけ拾う（押しっぱなしで連打にならないように）。
   スティックの遊びは 0.15、その外側を 0..1 に引き直してから曲線を通す。 */
var PAD_DEAD = 0.15;
var padPrev = ([] as any[]);
var pad = { back:false, hold:false, sneak:false, active:false, t:0 };
function padAxis(v: any){
  var a = Math.abs(v);
  if(a < PAD_DEAD) return 0;
  return Math.sign(v) * (a - PAD_DEAD) / (1 - PAD_DEAD);
}
function readPad(simDt: any){
  pad.back = pad.hold = pad.sneak = false;
  if(!navigator.getGamepads) return;
  var list = navigator.getGamepads(), gp = null;
  for(var i=0; i<list.length; i++){ if(list[i] && list[i].connected){ gp = list[i]; break; } }
  if(!gp){ pad.active = false; pad.t = 0; return; }
  var ax = gp.axes, bt = gp.buttons;
  function down(n: any){ return !!(bt[n] && (bt[n].pressed || bt[n].value > 0.5)); }
  function edge(n: any){ var d = down(n), was = !!padPrev[n]; padPrev[n] = d; return d && !was; }
  var mx = padAxis(ax[0] || 0), my = padAxis(ax[1] || 0);
  var lx = padAxis(ax[2] || 0), ly = padAxis(ax[3] || 0);
  var used = !!(mx || my || lx || ly);
  for(var b=0; b<bt.length; b++) if(down(b)) used = true;
  if(used){ pad.active = true; lastInputKind = 'pad'; }
  if(!pad.active) return;
  if(mx || my){ input.fwd = -my; input.side = mx; }
  /* 視点は経過時間に掛ける（フレームに掛けると端末の速さで回り方が変わる）。
     最大に倒して感度 1 で、横に 1 秒 2.4 ラジアン、縦に 1.8 ラジアン */
  /* 遊びの刻み（固定 1/60 秒）で掛ける。壁時計で掛けていたときは、1 フレームが 0.1 秒を超える
     端末（と CI）で回りが削られ、固定刻みで 1 フレームに何度も呼ばれるようになってからは
     2 回目以降が 0 になっていた。刻みで掛ければ、ゲームの時間に対して常に同じ速さで回る */
  var now = performance.now(), pdt = (simDt > 0) ? simDt : clamp((now - (pad.t || now)) / 1000, 0, 0.1);
  pad.t = now;
  input.lookX += lx * 2.4 * pdt * settings.sens;
  input.lookY += ly * 1.8 * pdt * settings.sens * (settings.invert ? -1 : 1);
  if(down(7) || down(10)) input.run = true;
  pad.sneak = down(6);
  PEEK.padWant = down(11);                                     // R3 で覗く
  pad.back = down(4);
  pad.hold = down(1);
  if(edge(0)) input.use = true;
  if(edge(2)) toggleLamp();
  if(edge(5)) throwBottle();
  if(edge(9)){ if(state === STATE.PLAY) doPause(); else if(state === STATE.PAUSE) doResume(); }
}

// --- タッチボタン ---
function bindHold(el: any, onDown: any, onUp: any){
  el.addEventListener('pointerdown', function(e: any){ e.preventDefault(); e.stopPropagation(); onDown(); }, {passive:false});
  ['pointerup','pointercancel','pointerleave'].forEach(function(ev){
    el.addEventListener(ev, function(e: any){ e.stopPropagation(); if(onUp) onUp(); });
  });
}
$('bLight').addEventListener('pointerdown', function(e: any){ e.preventDefault(); e.stopPropagation(); toggleLamp(); }, {passive:false});
bindHold($('bHold'),
  function(){ holdBtnDown = true; },
  function(){ holdBtnDown = false; });
bindHold($('bBack'),
  function(){ backBtnDown = true; },
  function(){ backBtnDown = false; });
$('bUse').addEventListener('pointerdown', function(e: any){ e.preventDefault(); e.stopPropagation(); input.use = true; }, {passive:false});
bindHold($('bPeek'), function(){ PEEK.touchWant = true; }, function(){ PEEK.touchWant = false; });
$('bThrow').addEventListener('pointerdown', function(e: any){ e.preventDefault(); e.stopPropagation(); throwBottle(); }, {passive:false});
$('bPause').addEventListener('pointerdown', function(e: any){ e.preventDefault(); e.stopPropagation(); if(state===STATE.PLAY) doPause(); }, {passive:false});

function toggleLamp(){
  if(state !== STATE.PLAY) return;
  if(player.battery <= 0 && !player.lamp){ toast('電池切れ', 1.4); return; }
  player.lamp = !player.lamp;
  Audio2.click(player.lamp);
  $('bLight').classList.toggle('hot', player.lamp);
}


/* --- メニューのパッド操作（設計指示書 第 12.2 節） ------------------------
   画面（パネル）が出ている間は、十字キーか左スティックで押せる物の間を動き、
   A で押し、B で戻る。動く先は画面上の位置で決める（見えている並びのとおりに動く）。
   つまみ（音量など）に居るときは、左右で値を動かす。 */
var padMenu: any = { prev:([] as any[]), rep:0, dir:(null as any) };
function visiblePanel(){
  for(var i=0; i<panels.length; i++){ var el = $(panels[i]); if(el && !el.hidden) return el; }
  return null;
}
function focusables(root: any){
  return Array.prototype.filter.call(root.querySelectorAll('button, input[type=range]'), function(el){
    if(el.disabled) return false;
    var r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  });
}
function moveFocus(root: any, dx: number, dy: any){
  var list = focusables(root); if(!list.length) return;
  var cur = (document.activeElement as any);
  if(list.indexOf(cur) < 0){ list[0].focus(); return; }
  var a = cur.getBoundingClientRect(), ax = a.left + a.width/2, ay = a.top + a.height/2, bs = 1e9;
    var best: any = null;
  list.forEach(function(el){
    if(el === cur) return;
    var r = el.getBoundingClientRect(), x = r.left + r.width/2 - ax, y = r.top + r.height/2 - ay;
    var along = x*dx + y*dy; if(along <= 4) return;               // その向きに無い
    var side = Math.abs(x*dy - y*dx);
    var sc = along + side*2.2;                                      // 真っ直ぐ先を優先
    if(sc < bs){ bs = sc; best = el; }
  });
  if(best){ best.focus(); best.scrollIntoView({ block:'nearest' }); }
}
function updatePadMenu(dt: number){
  if(state === STATE.PLAY && !visiblePanel()) return;
  var root = visiblePanel(); if(!root) return;
  if(!navigator.getGamepads) return;
  var list = navigator.getGamepads(), gp = null;
  for(var i=0; i<list.length; i++){ if(list[i] && list[i].connected){ gp = list[i]; break; } }
  if(!gp) return;
  var bt = gp.buttons, ax = gp.axes;
  function down(n: any){ return !!(bt[n] && (bt[n].pressed || bt[n].value > 0.5)); }
  function edge(n: any){ var d = down(n), w = !!padMenu.prev[n]; padMenu.prev[n] = d; return d && !w; }
  /* 画面が切り替わった最初のフレームは、ボタンの今の状態を控えるだけにする。
     Start で一時停止した瞬間に、同じ押下で「続ける」が押されてしまうため */
  if(padMenu.root !== root){
    padMenu.root = root;
    for(var b0=0; b0<bt.length; b0++) padMenu.prev[b0] = down(b0);
    padMenu.dir = 'hold'; padMenu.rep = 0.38;
    return;
  }
  // 向き：十字キー（12 上・13 下・14 左・15 右）か左スティック。押しっぱなしは間を置いて繰り返す
  var dir = down(12) || (ax[1] || 0) < -0.6 ? 'u' : down(13) || (ax[1] || 0) > 0.6 ? 'd' :
            down(14) || (ax[0] || 0) < -0.6 ? 'l' : down(15) || (ax[0] || 0) > 0.6 ? 'r' : null;
  padMenu.rep -= dt;
  if(dir && (dir !== padMenu.dir || padMenu.rep <= 0)){
    padMenu.rep = (dir === padMenu.dir) ? 0.12 : 0.38;
    var cur = (document.activeElement as any);
    if(cur && cur.type === 'range' && root.contains(cur) && (dir === 'l' || dir === 'r')){
      var st = +cur.step || 0.05, v = +cur.value + (dir === 'r' ? st : -st);
      cur.value = clamp(v, +cur.min, +cur.max);
      cur.dispatchEvent(new Event('input', { bubbles:true }));
      cur.dispatchEvent(new Event('change', { bubbles:true }));
    }else{
      moveFocus(root, dir === 'l' ? -1 : dir === 'r' ? 1 : 0, dir === 'u' ? -1 : dir === 'd' ? 1 : 0);
    }
  }
  padMenu.dir = dir;
  if(edge(0)){                                        // A：押す
    var f = (document.activeElement as any);
    if(f && root.contains(f) && f.tagName === 'BUTTON') f.click();
    else { var fl = focusables(root); if(fl.length) fl[0].focus(); }
  }
  if(edge(1)){                                        // B：戻る
    var back = (root.querySelector('[id$=Back]') as any) || (root.id === 'pause' ? $('btnResume') : null);
    if(back) back.click();
  }
  if(edge(9) && root.id === 'pause') $('btnResume').click();   // Start で続きへ
}

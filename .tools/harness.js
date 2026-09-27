// ward7.html をヘッドレスで起動する。three.js は本物（r128）を使い、
// WebGLRenderer と canvas2D と WebAudio だけ差し替える。
// 本物のベクトル／行列を使うのは、スタブが値を保持せず偽FAILを出す事故を避けるため。
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const HTML = fs.readFileSync(process.env.WARD7_FILE || '/home/user/ward7/ward7.html', 'utf8');
const scriptOpen = HTML.indexOf('<script>', HTML.indexOf('three.min.js'));
const scriptClose = HTML.indexOf('</script>', scriptOpen);
const GAME_SRC = HTML.slice(scriptOpen + '<script>'.length, scriptClose);
const SHELL = HTML.slice(0, HTML.indexOf('<script src=')) + '</body></html>';

// --- canvas 2D スタブ -------------------------------------------------------
// 未知のプロパティ代入と不正な色文字列で例外を投げ、テクスチャ生成の不備を炙り出す。
const CTX_PROPS = new Set(['fillStyle','strokeStyle','lineWidth','globalAlpha','globalCompositeOperation',
  'font','textAlign','textBaseline','lineCap','lineJoin','shadowBlur','shadowColor','shadowOffsetX',
  'shadowOffsetY','filter','miterLimit','lineDashOffset','imageSmoothingEnabled','direction']);
const CTX_METHODS = new Set(['fillRect','strokeRect','clearRect','beginPath','closePath','moveTo','lineTo',
  'arc','arcTo','ellipse','rect','fill','stroke','save','restore','translate','rotate','scale','transform',
  'setTransform','resetTransform','clip','fillText','strokeText','drawImage','quadraticCurveTo',
  'bezierCurveTo','setLineDash','getLineDash','createLinearGradient','createRadialGradient',
  'createPattern','getImageData','putImageData','createImageData','measureText','isPointInPath']);

const COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\)|hsla?\([^)]*\)|[a-zA-Z]+)$/;
let ctxErrors = [];

function makeCtx(canvas){
  const grad = () => ({ addColorStop(o, c){ checkColor(c, 'gradient stop'); } });
  function checkColor(v, where){
    if(typeof v === 'object') return;              // グラデーション／パターン
    if(typeof v !== 'string' || !COLOR_RE.test(v) || /NaN|undefined/.test(v))
      ctxErrors.push(where + ': 不正な色 ' + JSON.stringify(v));
  }
  const target = {
    canvas,
    createLinearGradient: grad, createRadialGradient: grad,
    createPattern: () => ({}),
    measureText: () => ({ width: 10 }),
    getLineDash: () => [],
    isPointInPath: () => false,
    getImageData: (x,y,w,h) => ({ width:w, height:h, data:new Uint8ClampedArray(w*h*4) }),
    createImageData: (w,h) => ({ width:w, height:h, data:new Uint8ClampedArray(w*h*4) }),
  };
  return new Proxy(target, {
    get(t, k){
      if(k in t) return t[k];
      if(CTX_METHODS.has(k)) return function(){ return undefined; };
      if(CTX_PROPS.has(k)) return t['_'+k];
      if(typeof k === 'symbol') return undefined;
      ctxErrors.push('未知のプロパティ読み取り: ' + String(k));
      return undefined;
    },
    set(t, k, v){
      if(k === 'fillStyle' || k === 'strokeStyle' || k === 'shadowColor') checkColor(v, String(k));
      if(!CTX_PROPS.has(k)){ ctxErrors.push('未知のプロパティ代入: ' + String(k)); }
      t['_'+k] = v; return true;
    }
  });
}

// --- DOM ------------------------------------------------------------------
const dom = new JSDOM(SHELL, { url: 'https://local/ward7.html?debug=1', pretendToBeVisual: true, runScripts: 'outside-only' });
const { window } = dom;
global.window = window; global.document = window.document;
global.navigator = window.navigator;

Object.defineProperty(window.navigator, 'deviceMemory', { value: 4, configurable: true });
Object.defineProperty(window.navigator, 'hardwareConcurrency', { value: 4, configurable: true });
Object.defineProperty(window.navigator, 'maxTouchPoints', { value: 5, configurable: true });
window.navigator.vibrate = () => true;
window.innerWidth = 390; window.innerHeight = 844; window.devicePixelRatio = 3;

const HTMLCanvasElement = window.HTMLCanvasElement;
HTMLCanvasElement.prototype.getContext = function(kind){
  if(kind === '2d') return this.__ctx2d || (this.__ctx2d = makeCtx(this));
  return { getExtension(){ return null; }, getParameter(){ return 4096; },
           canvas: this, getShaderPrecisionFormat(){ return {precision:1, rangeMin:1, rangeMax:1}; } };
};
HTMLCanvasElement.prototype.toDataURL = function(){ return 'data:image/png;base64,AAAA'; };

// --- WebAudio -------------------------------------------------------------
function param(v){ return { value:v, setValueAtTime(){return this;}, linearRampToValueAtTime(){return this;},
  exponentialRampToValueAtTime(){return this;}, setTargetAtTime(){return this;}, cancelScheduledValues(){return this;},
  setValueCurveAtTime(){return this;} }; }
function node(extra){
  return Object.assign({ connect(n){ return n; }, disconnect(){}, start(){}, stop(){},
    onended:null, channelCount:2 }, extra||{});
}
class FakeAudioContext {
  constructor(){ this.currentState = 'running'; this.sampleRate = 48000; this.destination = node();
    this.listener = { positionX:param(0), positionY:param(0), positionZ:param(0),
      forwardX:param(0), forwardY:param(0), forwardZ:param(0), upX:param(0), upY:param(1), upZ:param(0),
      setPosition(){}, setOrientation(){} }; }
  get state(){ return this.currentState; }
  get currentTime(){ return harnessTime; }
  resume(){ this.currentState='running'; return Promise.resolve(); }
  suspend(){ this.currentState='suspended'; return Promise.resolve(); }
  close(){ return Promise.resolve(); }
  createGain(){ return node({ gain: param(1) }); }
  createOscillator(){ return node({ frequency:param(440), detune:param(0), type:'sine',
    setPeriodicWave(){} }); }
  createBiquadFilter(){ return node({ frequency:param(350), Q:param(1), gain:param(0), detune:param(0), type:'lowpass' }); }
  createBufferSource(){ return node({ buffer:null, playbackRate:param(1), loop:false, loopStart:0, loopEnd:0, detune:param(0) }); }
  createBuffer(ch, len, sr){ const data = []; for(let i=0;i<ch;i++) data.push(new Float32Array(len));
    return { numberOfChannels:ch, length:len, sampleRate:sr, duration:len/sr, getChannelData:i=>data[i] }; }
  createDynamicsCompressor(){ return node({ threshold:param(-24), knee:param(30), ratio:param(12),
    attack:param(0.003), release:param(0.25), reduction:0 }); }
  createStereoPanner(){ return node({ pan: param(0) }); }
  createPanner(){ return node({ panningModel:'HRTF', distanceModel:'inverse', refDistance:1, maxDistance:10000,
    rolloffFactor:1, coneInnerAngle:360, coneOuterAngle:0, coneOuterGain:0,
    positionX:param(0), positionY:param(0), positionZ:param(0),
    orientationX:param(1), orientationY:param(0), orientationZ:param(0), setPosition(){}, setOrientation(){} }); }
  createConvolver(){ return node({ buffer:null, normalize:true }); }
  createDelay(){ return node({ delayTime: param(0) }); }
  createWaveShaper(){ return node({ curve:null, oversample:'none' }); }
  createAnalyser(){ return node({ fftSize:2048, frequencyBinCount:1024, getByteFrequencyData(){}, getByteTimeDomainData(){} }); }
  createChannelMerger(){ return node(); }
  createChannelSplitter(){ return node(); }
  createPeriodicWave(){ return {}; }
}
window.AudioContext = FakeAudioContext; window.webkitAudioContext = FakeAudioContext;

// --- 時間／rAF -------------------------------------------------------------
let harnessTime = 0;                 // 秒
let rafQueue = [];
window.requestAnimationFrame = cb => { rafQueue.push(cb); return rafQueue.length; };
window.cancelAnimationFrame = () => {};
// jsdom の performance は差し替え不可なので defineProperty で上書きする
// （global 側を触ると jsdom 実装が自分自身を呼んで無限再帰する）
Object.defineProperty(window, 'performance', { value: { now: () => harnessTime * 1000 }, configurable: true });

// --- three.js -------------------------------------------------------------
const threeSrc = fs.readFileSync(path.join(__dirname, 'three.min.js'), 'utf8');
window.self = window;
window.eval(threeSrc);
const THREE = window.THREE;
if(!THREE) throw new Error('three.js の読み込みに失敗');

// WebGLRenderer だけ差し替える（GLコンテキストが無いため）
const drawCalls = { render: 0 };
THREE.WebGLRenderer = function(opts){
  this.domElement = (opts && opts.canvas) || window.document.createElement('canvas');
  this.shadowMap = { enabled:false, type:0, autoUpdate:true };
  this.info = { render:{ calls:0, triangles:0 }, memory:{ geometries:0, textures:0 } };
  this.capabilities = { isWebGL2:false, getMaxAnisotropy:()=>4, maxTextures:16 };
  this.outputEncoding = 0; this.toneMapping = 0; this.toneMappingExposure = 1;
  this.setSize = function(){}; this.setPixelRatio = function(){};
  this.setClearColor = function(){}; this.clear = function(){};
  this.render = function(){ drawCalls.render++; };
  this.setRenderTarget = function(){}; this.dispose = function(){};
  this.getSize = function(t){ t = t || new THREE.Vector2(); return t.set(window.innerWidth, window.innerHeight); };
  this.getPixelRatio = function(){ return 1; };
  this.compile = function(){};
  this.getDrawingBufferSize = function(t){ t = t || new THREE.Vector2();
    return t.set(window.innerWidth, window.innerHeight); };
  this.getContext = function(){ return { getExtension(){ return null; } }; };
  this.getRenderTarget = function(){ return null; };
  this.setScissorTest = function(){}; this.setScissor = function(){}; this.setViewport = function(){};
  this.clearDepth = function(){}; this.clearColor = function(){}; this.clearStencil = function(){};
  this.forceContextLoss = function(){};
  this.physicallyCorrectLights = false; this.localClippingEnabled = false;
  this.autoClear = true; this.sortObjects = true; this.debug = { checkShaderErrors:true };
};

// --- 実行 ------------------------------------------------------------------
const logs = [];
window.console = { log:(...a)=>logs.push(['log',a.join(' ')]), warn:(...a)=>logs.push(['warn',a.join(' ')]),
  error:(...a)=>logs.push(['error',a.join(' ')]), info:(...a)=>logs.push(['info',a.join(' ')]) };
global.console_real = console;

let fatalMsg = null;
window.alert = m => { fatalMsg = m; };

window.eval(GAME_SRC);

/* WARD7_FAST=1 で「見た目の計算」を省く。
   ヘッドレスには描画が無いので、行列の更新結果は誰も読まない。
   rnd() を消費する演出コード自体は残すので、乱数の並びは変わらない。
   同一種で結果が一致することを確かめてから使うこと。 */
if(process.env.WARD7_FAST === '1'){
  THREE.Object3D.prototype.updateMatrixWorld = function(){};
  THREE.Object3D.prototype.updateWorldMatrix = function(){};
}

// 起動失敗の検出（fatal は #err を表示する）
const errEl = window.document.getElementById('err');
if(errEl && errEl.hidden === false) fatalMsg = window.document.getElementById('errMsg').textContent;

function pump(frames, dt){
  dt = dt || 1/60;
  for(let i=0;i<frames;i++){
    harnessTime += dt;
    const q = rafQueue; rafQueue = [];
    q.forEach(cb => cb(harnessTime * 1000));
  }
}

/* 仮想時計を 0 に戻す。
   ゲームの dt は (now - lastT)/1000 なので、時計が 80 万 ms まで進むと
   引き算の丸めが効いて dt が 1e-10 ほどずれる。それだけで 0.25 秒周期の
   タイマーが 1 フレーム前後し、以降の展開が変わる。
   1 プロセスで複数試行を回すときは、各試行の前にこれを呼ぶ。
   直後の 1 フレームは dt<=0 でゲーム側に捨てられるので、
   1 本目も同じ手順を踏ませて条件を揃えること。 */
function resetTime(){ harnessTime = 0; pump(1); }

module.exports = { window, THREE, pump, resetTime, logs, get ctxErrors(){ return ctxErrors; },
  resetCtxErrors(){ ctxErrors = []; }, get fatalMsg(){ return fatalMsg; },
  drawCalls, makeCtx, GAME_SRC, get time(){ return harnessTime; } };

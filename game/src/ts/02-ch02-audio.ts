/* =========================================================================
   2. オーディオ（全て手続き生成・外部ファイル無し）
   ========================================================================= */
var Audio2 = (function(){
  var ctx = (null as any), master = (null as any), noiseBuf = (null as any);
  var drone = (null as any), droneGain = (null as any), droneFilt = (null as any);
  var vol = 0.7, ready = false;
  var convolver = null, revSend = (null as any), revWet = (null as any);

  /* 残響のインパルス応答を書き込む。
     雑音に指数減衰を掛け、時間が経つほど高域を落とす（実際の部屋も
     高域から先に吸われる）。左右で別の雑音を引くので広がりが出る。
     NaN が 1 つでも混ざると畳み込みの出力が全部無音になり、
     しかも「静かなゲーム」なので気づけない。自己診断から呼べる形にしておく。 */
  function makeIR(out: any, sampleRate: any){
    var n = out.length, lp = 0;
    for(var i=0;i<n;i++){
      var t = i / n;
      var pre = Math.min(1, i / (sampleRate*0.012));   // 立ち上がりを少し遅らせる
      var v = (Math.random()*2 - 1) * Math.pow(1 - t, 2.6) * pre;
      lp += (v - lp) * (0.30 - 0.24*t);
      out[i] = lp * 1.7;
    }
    return out;
  }
  makeIR.len = function(sampleRate: any){ return Math.floor(sampleRate * 1.9); };
  var REV_OPEN = 0.34, REV_BOX = 0.06;   // 廊下 / 箱の中

  function init(){
    if(ready) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
    /* iPhone の消音スイッチが入っていると、Safari は Web Audio を黙らせる。
       ホラーは音が半分なので、音楽アプリと同じ「再生」の扱いを頼む
       （iOS 17 以降の Safari。無い環境では何も起きない）。
       iOS アプリ側でも AVAudioSession を playback にしてある。 */
    try{ if(navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
    try{ ctx = new AC(); }catch(e){ return false; }
    master = ctx.createGain(); master.gain.value = vol; master.connect(ctx.destination);

    /* --- 残響 -------------------------------------------------------------
       これまで乾いた音だけが鳴っていた。閉じた病棟の廊下で、足音にも
       唸り声にも空間の返りが無いのがいちばん嘘くさいところだった。

       音源ファイルは持たない方針なので、インパルス応答もここで作る。
       雑音に指数減衰を掛け、時間が経つほど高域を落とす（実際の部屋も
       高域から先に吸われる）。左右で別の雑音を使って広がりを出す。

       畳み込みは安くない処理なので、品質「高精細」以上でだけ通す。
       低スペック側は今までどおり乾いたまま鳴る。 */
    if((settings.quality|0) >= 2 && ctx.createConvolver){
      try{
        var ir = ctx.createBuffer(2, makeIR.len(ctx.sampleRate), ctx.sampleRate);
        for(var ch=0; ch<2; ch++) makeIR(ir.getChannelData(ch), ctx.sampleRate);
        convolver = ctx.createConvolver();
        convolver.buffer = ir; convolver.normalize = true;
        revSend = ctx.createGain(); revSend.gain.value = 1.0;
        revWet  = ctx.createGain(); revWet.gain.value = REV_OPEN;
        master.connect(revSend); revSend.connect(convolver);
        convolver.connect(revWet); revWet.connect(ctx.destination);
      }catch(e){ convolver = null; }
    }

    var len = Math.floor(ctx.sampleRate * 2);
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for(var i=0;i<len;i++) d[i] = Math.random()*2-1;
    ready = true;
    loadSfx();
    return true;
  }
  /* 収録素材の音（設計指示書 第 10.1 節）。assets.js の sfx/<群>_<番号> を解いて群ごとに持つ。
     assets.js は後から読まれる（defer）ので、鳴らす前にも取りに行く。
     解けなかった群は合成の音のまま鳴る（素材が無くても遊べる） */
  var SFX = ({} as Record<string, any>), sfxLoading = false;
  function loadSfx(){
    if(sfxLoading || !ctx || !window.W7_ASSETS) return;
    sfxLoading = true;
    Object.keys(window.W7_ASSETS).forEach(function(k){
      if(k.indexOf('sfx/') !== 0) return;
      var grp = k.slice(4).replace(/_\d+$/, '');
      try{
        var bin = atob(window.W7_ASSETS[k].split(',')[1]), u8 = new Uint8Array(bin.length);
        for(var i=0; i<bin.length; i++) u8[i] = bin.charCodeAt(i);
        var pr = ctx.decodeAudioData(u8.buffer, function(buf: any){ buf.w7sfx = grp; (SFX[grp] = SFX[grp] || []).push(buf); }, function(){});
        if(pr && pr.catch) pr.catch(function(){});
      }catch(e){}
    });
  }
  function sfx(grp: any){ if(!sfxLoading) loadSfx(); var a = SFX[grp]; return (a && a.length) ? a[(Math.random()*a.length)|0] : null; }
  /* 素材を 1 回鳴らす。rate は速さ（＝高さ）、to は繋ぐ先 */
  function playSfx(buf: any, t: any, rate: any, gain: any, to: any){
    var s: any = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    var g = ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(to); s.start(t);
    return s;
  }
  function resume(){
    if(!ready) return;
    /* iOS の Safari は着信・Siri・他のアプリの音で 'interrupted' という独自の状態にする。
       'suspended' だけを見ていると、電話の後に音が戻らなかった（設計指示書 第 1.2 節） */
    if(ctx.state !== 'running' && ctx.state !== 'closed'){ ctx.resume().catch(function(){}); }
  }
  function audioState(){ return ready ? ctx.state : 'none'; }
  function suspend(){ if(ready && ctx.state === 'running'){ ctx.suspend().catch(function(){}); } }
  function setVol(v: any){ vol = v; if(master) master.gain.value = v; }
  /* 箱の中に入ると、耳のすぐ横に板がある。廊下と同じ返りが鳴っていると
     「隠れた」感じが出ない。入っている間だけ残響を絞る。 */
  /* 部屋の広さで返りを変える（第 10.2 節）。箱の中はほぼ無し、廊下は並、
     大部屋・ホールは深く。space: 'box' | 'hall' | 'room' */
  var REV_ROOM = 0.46, spaceNow = (null as any);
  function setSpace(space: any){
    if(space === true) space = 'box'; else if(space === false || !space) space = 'hall';
    if(!revWet || !ready || space === spaceNow) return;
    spaceNow = space;
    revWet.gain.setTargetAtTime(space === 'box' ? REV_BOX : (space === 'room' ? REV_ROOM : REV_OPEN),
                                ctx.currentTime, 0.4);
  }

  function noiseSrc(){
    var s: any = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }
  function env(g: any, t0: any, a: any, d: any, peak: any){
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak), t0+a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+a+d);
  }

  // 位置を持つ持続音のための共通バス（音量・左右・こもり具合を毎フレーム更新する）
  var buses = { hunter:(null as any), lamps:([] as any[]), exit:(null as any) };
  /* 頭部伝達関数（HRTF、設計指示書 第 10.2 節）。ヘッドホンなら前後と上下まで
     分かる。左右の振り分け（StereoPanner）では「真後ろ」と「真正面」が同じに鳴る。
     音量とこもりは今までどおりこちらで決め、Panner には向きだけを渡す
     （距離による減衰は切る＝rolloffFactor 0）。スピーカーで遊ぶときは左右の振り分けに戻す。 */
  var hrtf = true;
  function setHRTF(on: any){ hrtf = !!on; }
  function makePanner(){
    if(!hrtf || !ctx.createPanner) return null;
    var p = ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.rolloffFactor = 0; p.refDistance = 1;
    return p;
  }
  function setDir(p: any, pan: any, fwd: any, t: any, tc: any){
    // 聞き手は原点で -Z を向いている。右が +X、前が -Z
    var x = clamp(pan, -1, 1), z = -(fwd === undefined ? Math.sqrt(Math.max(0, 1 - x*x)) : fwd);
    if(p.positionX){ p.positionX.setTargetAtTime(x, t, tc); p.positionY.setTargetAtTime(0, t, tc); p.positionZ.setTargetAtTime(z, t, tc); }
    else p.setPosition(x, 0, z);
  }
  function makeBus(){
    var g = ctx.createGain(); g.gain.value = 0.0001;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 800; lp.Q.value = 0.5;
    var hp = makePanner();
    var sp = (!hp && ctx.createStereoPanner) ? ctx.createStereoPanner() : null;
    g.connect(lp);
    if(hp){ lp.connect(hp); hp.connect(master); }
    else if(sp){ lp.connect(sp); sp.connect(master); } else { lp.connect(master); }
    return { in:g, gain:g, lp:lp, pan:sp, hrtf:hp, vol:0, panV:0, cut:800 };
  }
  function setBus(bus: any, vol: any, panV: any, cut: any, fwd: any){
    if(!bus || !ready) return;
    var t = ctx.currentTime;
    bus.vol = vol; bus.panV = panV; bus.cut = cut;
    bus.gain.gain.setTargetAtTime(Math.max(0.00001, vol), t, 0.12);
    bus.lp.frequency.setTargetAtTime(Math.max(120, cut), t, 0.16);
    if(bus.hrtf) setDir(bus.hrtf, panV / 0.85, fwd, t, 0.09);      // 左右の値は 0.85 倍して渡されている
    else if(bus.pan) bus.pan.pan.setTargetAtTime(clamp(panV, -1, 1), t, 0.09);
  }
  function setHunterVoice(v: any, p: any, c: any, f?: any){ setBus(buses.hunter, v, p, c, f); }
  function setLampVoice(i: any, v: any, p: any, c: any, f?: any){ setBus(buses.lamps[i], v, p, c, f); }
  function setExitVoice(v: any, p: any, c: any, f?: any){ setBus(buses.exit, v, p, c, f); }
  function busCount(){ return (buses.hunter?1:0) + buses.lamps.length + (buses.exit?1:0); }
  function busState(){
    return {
      hunter: buses.hunter ? { vol:+buses.hunter.vol.toFixed(4), pan:+buses.hunter.panV.toFixed(3), cut:Math.round(buses.hunter.cut) } : null,
      lamps: buses.lamps.map(function(b){ return { vol:+b.vol.toFixed(4), pan:+b.panV.toFixed(3) }; }),
      exit: buses.exit ? { vol:+buses.exit.vol.toFixed(4), pan:+buses.exit.panV.toFixed(3) } : null,
      panner: !!(buses.hunter && buses.hunter.pan)
    };
  }

  function startAmbient(){
    if(!ready || drone) return;
    droneGain = ctx.createGain(); droneGain.gain.value = 0.0001;
    droneFilt = ctx.createBiquadFilter(); droneFilt.type='lowpass';
    droneFilt.frequency.value = 260; droneFilt.Q.value = 2;
    droneFilt.connect(droneGain); droneGain.connect(master);

    drone = [];
    [41.2, 61.7, 82.4].forEach(function(f,i){
      var o = ctx.createOscillator();
      o.type = i===2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f * (1 + (i-1)*0.004);
      var g = ctx.createGain(); g.gain.value = i===2?0.10:0.16;
      o.connect(g); g.connect(droneFilt); o.start();
      drone.push(o);
    });
    /* 空調。収録の持続音（第 10.1 節）があればそれを敷き、無ければ（まだ解けていない間も）
       合成の雑音で鳴らす。解けたら差し替える */
    var n = noiseSrc();
    var nf = ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=420; nf.Q.value=0.7;
    var ng = ctx.createGain(); ng.gain.value=0.05;
    n.connect(nf); nf.connect(ng); ng.connect(master); n.start();
    drone.push(n);
    var myDrone = drone;
    (function bed(tries){
      if(drone !== myDrone) return;                       // 入り直した
      var hv = sfx('amb_hvac'), ar = sfx('amb_air');
      if(!hv){ if(tries > 0) setTimeout(function(){ bed(tries - 1); }, 500); return; }
      ng.gain.setTargetAtTime(0.0001, ctx.currentTime, 1.5);            // 合成の雑音は下げる
      [[hv, 0.22, 0], [ar, 0.07, 1]].forEach(function(e){
        if(!e[0]) return;
        var s: any = ctx.createBufferSource(); s.buffer = e[0]; s.loop = true;
        var g = ctx.createGain(); g.gain.value = 0.0001; g.gain.setTargetAtTime(e[1], ctx.currentTime, 2.0);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = e[2] ? 2600 : 1400;
        s.connect(lp); lp.connect(g); g.connect(droneGain ? droneGain : master);
        s.start(ctx.currentTime, e[2] * 1.7);          // 2 本の輪の頭をずらして周期を揃えない
        myDrone.push(s);
      });
    })(20);

    droneGain.gain.setTargetAtTime(0.5, ctx.currentTime, 2.0);

    // --- 追跡者そのものが発する音。方向と壁越しのこもりで居場所が滲む ---
    buses.hunter = makeBus();
    var hn = noiseSrc();
    var hbp = ctx.createBiquadFilter(); hbp.type='bandpass';
    hbp.frequency.value = 520; hbp.Q.value = 0.8;
    var hng = ctx.createGain(); hng.gain.value = 0.55;
    hn.connect(hbp); hbp.connect(hng); hng.connect(buses.hunter.in); hn.start();
    var ho = ctx.createOscillator(); ho.type='sawtooth'; ho.frequency.value = 46.5;
    var hog = ctx.createGain(); hog.gain.value = 0.3;
    ho.connect(hog); hog.connect(buses.hunter.in); ho.start();
    // 呼吸のような周期的な揺れ
    var hlfo = ctx.createOscillator(); hlfo.type='sine'; hlfo.frequency.value = 0.42;
    var hlg = ctx.createGain(); hlg.gain.value = 0.4;
    hlfo.connect(hlg); hlg.connect(hng.gain); hlfo.start();
    drone.push(hn, ho, hlfo);

    // --- 非常灯のうなり。部屋の位置が音でも分かる ---
    for(var li=0; li<2; li++){
      var lb = makeBus();
      var l1 = ctx.createOscillator(); l1.type='sawtooth'; l1.frequency.value = 100 + li*0.7;
      var l1g = ctx.createGain(); l1g.gain.value = 0.10;
      l1.connect(l1g); l1g.connect(lb.in); l1.start();
      var l2 = ctx.createOscillator(); l2.type='square'; l2.frequency.value = 50 + li*0.4;
      var l2g = ctx.createGain(); l2g.gain.value = 0.05;
      l2.connect(l2g); l2g.connect(lb.in); l2.start();
      buses.lamps.push(lb);
      drone.push(l1, l2);
    }

    // --- 非常口の誘導音。解錠後だけ鳴り、方向の手がかりになる ---
    buses.exit = makeBus();
    var e1 = ctx.createOscillator(); e1.type='sine'; e1.frequency.value = 396;
    var e1g = ctx.createGain(); e1g.gain.value = 0.16;
    e1.connect(e1g); e1g.connect(buses.exit.in); e1.start();
    var e2 = ctx.createOscillator(); e2.type='sine'; e2.frequency.value = 528;
    var e2g = ctx.createGain(); e2g.gain.value = 0.10;
    e2.connect(e2g); e2g.connect(buses.exit.in); e2.start();
    var elfo = ctx.createOscillator(); elfo.type='sine'; elfo.frequency.value = 0.55;
    var elg = ctx.createGain(); elg.gain.value = 0.09;
    elfo.connect(elg); elg.connect(e2g.gain); elfo.start();
    drone.push(e1, e2, elfo);

    buildScore();
  }

  /* --- 劇伴（設計指示書 第 10.3 節） -----------------------------------
     追跡者との距離と状態で 4 段を行き来する：静寂 → 気配 → 接近 → 追跡。
     段ごとに別の層を持ち、上の段ほど層を足していく（下の段の音は残る）。
     切り替えは 1.5 秒ほどで交差させる。音源ファイルは使わず全部ここで作る。
       気配 … 短 2 度でぶつかる低い弦のような持続音。ゆっくり息をする
       接近 … 心拍に近い周期の低い脈と、高いところで震える不協和
       追跡 … 速い打ち込みの脈と、上下に掻きむしる帯域雑音
     追跡が終わったら 8 秒だけ劇伴と環境音を落とし切る（REST）。
     安堵を一度作ってから次の緊張へ入るため。追跡者の音は落とさない。 */
  var score = (null as any), scoreLevel = 0, restUntil = 0;
  var SCORE_X = 0.55;            // 交差の時定数（setTargetAtTime。約 3 倍で落ち着く ≒ 1.5 秒）
  var REST_SEC = 8, REST_BACK = 2.5;
  function buildScore(){
    score = { bus: ctx.createGain(), layers: [] };
    score.bus.gain.value = 1; score.bus.connect(master);
    function layer(){ var g = ctx.createGain(); g.gain.value = 0.0001; g.connect(score.bus); score.layers.push(g); return g; }
    // 1: 気配
    var L1 = layer();
    var f1 = ctx.createBiquadFilter(); f1.type = 'lowpass'; f1.frequency.value = 340; f1.Q.value = 0.9;
    f1.connect(L1);
    [55.0, 58.27, 82.4].forEach(function(f, i){
      var o = ctx.createOscillator(); o.type = i === 2 ? 'triangle' : 'sawtooth';
      o.frequency.value = f; o.detune.value = (i - 1) * 7;
      var g = ctx.createGain(); g.gain.value = i === 2 ? 0.05 : 0.09;
      o.connect(g); g.connect(f1); o.start(); drone.push(o);
    });
    var br = ctx.createOscillator(); br.frequency.value = 0.07;       // 息をするような揺れ
    var brg = ctx.createGain(); brg.gain.value = 120;
    br.connect(brg); brg.connect(f1.frequency); br.start(); drone.push(br);
    // 2: 接近
    var L2 = layer();
    var sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = 36;
    var subg = ctx.createGain(); subg.gain.value = 0.0;
    var pul = ctx.createOscillator(); pul.type = 'sine'; pul.frequency.value = 0.9;   // 心拍より少し遅い
    var pulg = ctx.createGain(); pulg.gain.value = 0.34;
    pul.connect(pulg); pulg.connect(subg.gain);
    sub.connect(subg); subg.connect(L2); sub.start(); pul.start(); drone.push(sub, pul);
    [1244.5, 1318.5].forEach(function(f){
      var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      var g = ctx.createGain(); g.gain.value = 0.012;
      var tr = ctx.createOscillator(); tr.frequency.value = 5.3 + Math.random();
      var trg = ctx.createGain(); trg.gain.value = 0.010;
      tr.connect(trg); trg.connect(g.gain);
      o.connect(g); g.connect(L2); o.start(); tr.start(); drone.push(o, tr);
    });
    // 3: 追跡
    var L3 = layer();
    var kn = noiseSrc();
    var kf = ctx.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 180;
    var kg = ctx.createGain(); kg.gain.value = 0.0;
    var kl = ctx.createOscillator(); kl.type = 'square'; kl.frequency.value = 2.3;   // 打ち込みの脈
    var klg = ctx.createGain(); klg.gain.value = 0.55;
    kl.connect(klg); klg.connect(kg.gain);
    kn.connect(kf); kf.connect(kg); kg.connect(L3); kn.start(); kl.start(); drone.push(kn, kl);
    var sn = noiseSrc();
    var sf = ctx.createBiquadFilter(); sf.type = 'bandpass'; sf.frequency.value = 1500; sf.Q.value = 6;
    var sg = ctx.createGain(); sg.gain.value = 0.16;
    var sw = ctx.createOscillator(); sw.frequency.value = 0.17;
    var swg = ctx.createGain(); swg.gain.value = 800;
    sw.connect(swg); swg.connect(sf.frequency);
    sn.connect(sf); sf.connect(sg); sg.connect(L3); sn.start(); sw.start(); drone.push(sn, sw);
    scoreLevel = 0;
  }
  var LAYER_VOL = [0.55, 0.60, 0.50];
  /* 劇伴の段を決める（0..3）。段 n では層 1..n を鳴らす */
  function setScore(level: any){
    if(!score) return;
    level = clamp(level|0, 0, 3);
    var t = ctx.currentTime;
    var resting = t < restUntil;
    // 毎フレーム呼ばれる。段も静寂も変わっていなければ何も積まない（AudioParam の予定が溜まる）
    if(level === scoreLevel && resting === score.wasResting) return;
    score.wasResting = resting;
    if(scoreLevel === 3 && level < 3){ rest(); resting = true; score.wasResting = true; }   // 追跡が終わった
    scoreLevel = level;
    for(var i=0; i<3; i++){
      var on = (i < level) && (!resting || level === 3);
      score.layers[i].gain.setTargetAtTime(on ? LAYER_VOL[i] : 0.0001, t, SCORE_X);
    }
    if(level === 3 && resting){ restUntil = 0; unrest(); }
  }
  /* 8 秒の静寂。環境音の持続音と劇伴を落とす。追跡が再開すれば即座に戻る */
  function rest(){
    if(!score) return;
    var t = ctx.currentTime;
    restUntil = t + REST_SEC;
    score.bus.gain.setTargetAtTime(0.0001, t, 0.4);
    if(droneGain) droneGain.gain.setTargetAtTime(0.02, t, 0.6);
    score.bus.gain.setTargetAtTime(1, t + REST_SEC, REST_BACK / 3);
    if(droneGain) droneGain.gain.setTargetAtTime(0.5, t + REST_SEC, REST_BACK / 3);
  }
  function unrest(){
    var t = ctx.currentTime;
    score.bus.gain.cancelScheduledValues(t); score.bus.gain.setTargetAtTime(1, t, 0.15);
    if(droneGain){ droneGain.gain.cancelScheduledValues(t); droneGain.gain.setTargetAtTime(0.5, t, 0.3); }
  }
  function resting(){ return !!ctx && ctx.currentTime < restUntil; }
  function stopAmbient(){
    if(!drone) return;
    try{ drone.forEach(function(o: any){ try{o.stop();}catch(e){} }); }catch(e){}
    drone = null; droneGain = null; droneFilt = null;
    setWater(false);
    score = null; scoreLevel = 0; restUntil = 0;
    buses.hunter = null; buses.lamps = []; buses.exit = null;
  }
  function setTension(t: any){ // 0..1
    if(!droneFilt) return;
    droneFilt.frequency.setTargetAtTime(260 + t*1500, ctx.currentTime, 0.35);
    if(droneGain && !resting()) droneGain.gain.setTargetAtTime(0.5 + t*0.55, ctx.currentTime, 0.4);
  }

  /* 足音。mat は 0=柔らかい（埃・布）〜 1=硬い（タイル）。
     同じ音が延々と鳴っていると床がどこも同じに感じる。呼び出し側が
     その場所から決まる値を渡すので、同じ場所は毎回同じ音になる。 */
  function step(hard: any, mat: any, vol?: any){
    if(!ready) return;
    vol = (vol === undefined) ? 1 : vol;
    mat = (mat === undefined) ? 0.5 : clamp(mat, 0, 1);
    var t = ctx.currentTime;
    /* 収録の足音。硬い床はコンクリート、柔らかい所は布。速さを毎回少しずらして同じ音に聞こえさせない */
    var sb = sfx(mat > 0.4 ? 'step_hard' : 'step_soft');
    if(sb){
      playSfx(sb, t, 0.86 + mat*0.12 + Math.random()*0.08 + (hard ? 0.04 : 0), (hard ? 0.62 : 0.4) * vol, master);
      return;
    }
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    n.playbackRate.value = 0.6 + mat*0.5 + Math.random()*0.4;
    var f = ctx.createBiquadFilter(); f.type='bandpass';
    f.frequency.value = 520 + mat*900 + Math.random()*380;
    f.Q.value = 1.0 + mat*1.4;
    var g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(master);
    // 硬い床ほど短く切れる
    env(g, t, 0.005, (hard?0.16:0.10) * (1.25 - mat*0.5), (hard?0.28:0.16) * vol);
    n.start(t); n.stop(t+0.3);
    // 硬い床では踵の当たりが上に乗る
    if(mat > 0.55){
      var o = ctx.createOscillator(); o.type='triangle';
      o.frequency.setValueAtTime(2400 + Math.random()*900, t);
      var g2 = ctx.createGain(); o.connect(g2); g2.connect(master);
      env(g2, t, 0.001, 0.035, (hard?0.09:0.05) * (mat-0.55)/0.45 * vol);
      o.start(t); o.stop(t+0.08);
    }
  }
  function heart(intensity: any){
    if(!ready) return;
    var t = ctx.currentTime;
    function thump(off: any, amp: any){
      var o = ctx.createOscillator(); o.type='sine';
      o.frequency.setValueAtTime(78, t+off);
      o.frequency.exponentialRampToValueAtTime(38, t+off+0.16);
      var g = ctx.createGain(); o.connect(g); g.connect(master);
      env(g, t+off, 0.012, 0.19, amp*intensity);
      o.start(t+off); o.stop(t+off+0.36);
    }
    thump(0, 0.55); thump(0.17, 0.34);
  }
  function pickup(){
    if(!ready) return;
    var t = ctx.currentTime;
    [880, 1320, 1760].forEach(function(f,i){
      var o = ctx.createOscillator(); o.type='sine'; o.frequency.value=f;
      var g = ctx.createGain(); o.connect(g); g.connect(master);
      env(g, t+i*0.06, 0.01, 0.5, 0.14);
      o.start(t+i*0.06); o.stop(t+i*0.06+0.7);
    });
  }
  function unlock(){
    if(!ready) return;
    var t = ctx.currentTime;
    [147, 220, 294, 440].forEach(function(f,i){
      var o = ctx.createOscillator(); o.type='triangle'; o.frequency.value=f;
      var g = ctx.createGain(); o.connect(g); g.connect(master);
      env(g, t+i*0.09, 0.02, 1.1, 0.16);
      o.start(t+i*0.09); o.stop(t+i*0.09+1.4);
    });
  }
  function click(on: any){
    if(!ready) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type='square';
    o.frequency.setValueAtTime(on?1400:900, t);
    var g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, t, 0.003, 0.05, 0.07);
    o.start(t); o.stop(t+0.09);
  }
  function stinger(){
    if(!ready) return;
    var soft = settings.softScare ? 0.35 : 1;   // 恐怖の調整（第 13 章）
    var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(master);
    env(g, t, 0.01, 1.5, 0.3 * soft);
    [196, 207, 277, 370].forEach(function(f){
      var o = ctx.createOscillator(); o.type='sawtooth';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f*1.9, t+1.3);
      var gg = ctx.createGain(); gg.gain.value = 0.25;
      o.connect(gg); gg.connect(g); o.start(t); o.stop(t+1.6);
    });
  }
  function scream(){
    if(!ready) return;
    var soft = settings.softScare ? 0.35 : 1;   // 恐怖の調整（第 13 章）
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(180, t+1.2);
    var g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.008, 1.3, 0.5 * soft);
    n.start(t); n.stop(t+1.5);

    var o = ctx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(70, t+1.0);
    var og = ctx.createGain(); o.connect(og); og.connect(master);
    env(og, t, 0.01, 1.1, 0.28 * soft);
    o.start(t); o.stop(t+1.3);
  }
  /* 追跡者の声（一発物）。
     持続音のバス（唸り）は「そこに居る」ことしか伝えない。見つかった
     瞬間も、見失った瞬間も、すぐ隣を探っている時も、耳では全部
     同じに聞こえていた。画面から目を離していると状況が読めない。

     声帯（鋸波）＋ホルマント帯域 3 本＋息の雑音、という組み立てにすると
     合成音でも「人の喉から出た」ように聞こえる。母音はホルマントの
     位置で決まるので、その 3 本を動かすだけで声色を撃ち分けられる。
     外部ファイルを持たない方針のまま、種類を増やせるのはこの形だけ。 */
  var VOX = [
    // f0 の始め/終わり, 長さ, ホルマント3本, 息の量, 音量, 喉の震え(Hz, 深さ)
    { f0: 64, f1: 46, dur:1.05, fm:[380, 860,2100], air:0.30, amp:0.34, wob:5.2, wobA:0.05 }, // 0 唸り
    { f0:112, f1: 96, dur:0.90, fm:[640,1180,2500], air:0.22, amp:0.30, wob:0,   wobA:0    }, // 1 笑い
    { f0:148, f1: 72, dur:1.35, fm:[720,1320,2650], air:0.55, amp:0.52, wob:7.0, wobA:0.09 }, // 2 咆哮
    { f0: 78, f1: 70, dur:1.20, fm:[300, 720,1900], air:0.18, amp:0.16, wob:3.4, wobA:0.04 }, // 3 呟き
    { f0: 96, f1: 54, dur:0.55, fm:[520,1050,2300], air:0.45, amp:0.36, wob:9.0, wobA:0.07 }  // 4 苛立ち
  ];
  function hunterVocal(kind: any, dist: number, pan: any, blocked: boolean){
    if(!ready) return;
    var V = VOX[kind|0] || VOX[0];
    var t = ctx.currentTime;
    var att = stepAtten(dist) * (blocked ? 0.5 : 1);
    if(att <= 0.0008) return;                       // 遠すぎる声は作らない（ノード代の節約）
    var n01 = clamp(dist / STEP_MAX, 0, 1);

    var out = master;
    if(ctx.createStereoPanner){
      var sp = ctx.createStereoPanner();
      sp.pan.value = clamp(pan || 0, -1, 1); sp.connect(master); out = sp;
    }
    // 壁越しの落ち方は足音と揃える。声だけ抜けが良いと壁の意味が消える
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = blocked ? (240 + 300*(1-n01))
                                 : (420 + 3000*Math.pow(1-n01, 1.8));
    lp.Q.value = 0.4; lp.connect(out);

    var bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(lp);

    // 個体差。同じ波形が繰り返されると、二度目で作り物だと分かる
    var det = 0.88 + Math.random()*0.26;
    var dur = V.dur * (0.9 + Math.random()*0.22);

    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(V.f0*det, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, V.f1*det), t+dur);
    if(V.wobA > 0){
      var lfo = ctx.createOscillator(); lfo.type = 'sine';
      lfo.frequency.value = V.wob * (0.8 + Math.random()*0.5);
      var lg = ctx.createGain(); lg.gain.value = V.f0*det*V.wobA;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t+dur+0.25);
    }
    var nz = ctx.createBufferSource(); nz.buffer = noiseBuf;
    nz.playbackRate.value = 0.7 + Math.random()*0.5;
    var ng = ctx.createGain(); ng.gain.value = V.air;

    // ホルマントは並列。直列に繋ぐと帯域が積で潰れて蚊の鳴くような音になる
    var src = ctx.createGain(); src.gain.value = 1;
    o.connect(src); nz.connect(ng); ng.connect(src);
    for(var fi=0; fi<3; fi++){
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass';
      bp.frequency.value = V.fm[fi] * (0.94 + Math.random()*0.12);
      bp.Q.value = 4 + fi*2;
      var bg = ctx.createGain(); bg.gain.value = 1 / (1 + fi*0.9);
      src.connect(bp); bp.connect(bg); bg.connect(bus);
    }

    if(kind === 1){
      // 笑いだけは一息ではなく、息を詰めて刻む。刻みの数も毎回変える
      var g1 = bus.gain, nb = 4 + ((Math.random()*3)|0), sp1 = dur / nb;
      g1.cancelScheduledValues(t); g1.setValueAtTime(0.0001, t);
      for(var b2=0; b2<nb; b2++){
        var bt = t + b2*sp1;
        g1.exponentialRampToValueAtTime(Math.max(0.0002, V.amp*att*(1 - b2*0.13)), bt + sp1*0.18);
        g1.exponentialRampToValueAtTime(0.0002, bt + sp1*0.92);
      }
    }else{
      env(bus, t, kind===2 ? 0.03 : 0.10, dur, V.amp*att);
    }
    o.start(t);  o.stop(t+dur+0.3);
    nz.start(t); nz.stop(t+dur+0.3);
  }

  var STEP_MAX = 40;          // ここから徐々に聞こえ始める
  function stepAtten(dist: number){
    // 逆距離カーブ＋端の滑らかなフェード。急に鳴り出さず連続的に近づく
    var n = clamp(dist / STEP_MAX, 0, 1);
    return (6 / (6 + dist)) * (1 - n*n*n);
  }
  function hunterStep(dist: number, chasing: boolean, pan: any, blocked: boolean, fwd: any){
    if(!ready) return;
    var t = ctx.currentTime;
    var att = stepAtten(dist) * (blocked ? 0.55 : 1);
    if(att <= 0.0005) return;
    var n01 = clamp(dist / STEP_MAX, 0, 1);

    // 出口：ヘッドホンなら HRTF で向きごと、そうでなければ左右へ振る
    var out = master, hp = makePanner();
    if(hp){ setDir(hp, (pan || 0) / 0.85, fwd, t, 0.001); hp.connect(master); out = hp; }
    else if(ctx.createStereoPanner){
      var sp = ctx.createStereoPanner();
      sp.pan.value = clamp(pan || 0, -1, 1);
      sp.connect(master);
      out = sp;
    }
    // 遠いほど high をそぎ落として輪郭をぼかす＝距離感が連続する
    var lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = blocked ? (220 + 320 * (1 - n01))      // 壁越しは低い音だけが届く
                                 : (300 + 2600 * Math.pow(1 - n01, 2));
    lp.Q.value = 0.4;
    lp.connect(out);

    // 重い踏み込み
    var o = ctx.createOscillator(); o.type='sine';
    o.frequency.setValueAtTime(chasing?115:82, t);
    o.frequency.exponentialRampToValueAtTime(34, t+0.2);
    var og = ctx.createGain(); o.connect(og); og.connect(lp);
    env(og, t, 0.006, 0.24, 0.42*att);
    o.start(t); o.stop(t+0.34);

    /* 収録の足音を低く引き下げて重ねる（人より重い体の踏み込み）。あれば引きずる雑音の代わりに */
    var hb = sfx('step_hard');
    if(hb){ playSfx(hb, t, (chasing ? 0.7 : 0.6) + Math.random()*0.05, 1.1 * att, lp); return; }
    // 引きずる音（遠いと減衰を強めにして踏み込みだけが残るようにする）
    var nz = ctx.createBufferSource(); nz.buffer = noiseBuf;
    nz.playbackRate.value = 0.5 + Math.random()*0.3;
    var f = ctx.createBiquadFilter(); f.type='bandpass';
    f.frequency.value = 320 + Math.random()*260; f.Q.value = 0.9;
    var ng = ctx.createGain();
    nz.connect(f); f.connect(ng); ng.connect(lp);
    env(ng, t+0.02, 0.03, chasing?0.20:0.32, 0.20*att*(0.45 + 0.55*(1-n01)));
    nz.start(t); nz.stop(t+0.5);
  }
  function gasp(){
    if(!ready) return;
    var t = ctx.currentTime;
    for(var i=0;i<2;i++){
      var n = ctx.createBufferSource(); n.buffer = noiseBuf;
      n.playbackRate.value = 0.9 + Math.random()*0.4;
      var f = ctx.createBiquadFilter(); f.type='bandpass';
      f.frequency.setValueAtTime(1100 - i*300, t + i*0.30);
      f.Q.value = 0.9;
      var g = ctx.createGain();
      n.connect(f); f.connect(g); g.connect(master);
      env(g, t + i*0.30, 0.05, 0.26, 0.20 - i*0.06);
      n.start(t + i*0.30); n.stop(t + i*0.30 + 0.5);
    }
  }
  function hurt(){
    if(!ready) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type='square';
    o.frequency.setValueAtTime(160, t);
    o.frequency.exponentialRampToValueAtTime(48, t+0.3);
    var g = ctx.createGain(); o.connect(g); g.connect(master);
    env(g, t, 0.005, 0.34, 0.34);
    o.start(t); o.stop(t+0.45);
  }
  /* 環境音の一発物。
     これまで「きしみ」1 種類しか無く、9〜23 秒ごとに同じ音が鳴っていた。
     無人の病棟は静かなだけではなく、時々どこかで何かが鳴る。
     4 種類を手続きで作り、左右の位置と遠さも毎回変える。
     どれも短く小さい——大きな音は追跡者のための場所を取っておく。 */
  function ambientOne(kind: any, pan: any, far: any){
    if(!ready) return;
    var t = ctx.currentTime;
    var out = master;
    if(ctx.createStereoPanner){
      var sp = ctx.createStereoPanner();
      sp.pan.value = clamp(pan, -1, 1); sp.connect(master); out = sp;
    }
    // 遠いほど高域を落とす。距離感は音量より高域の量で出る
    var lp = ctx.createBiquadFilter(); lp.type='lowpass';
    lp.frequency.value = 380 + 3200 * (1 - far); lp.Q.value = 0.5;
    lp.connect(out);
    var amp = (0.10 + 0.10*(1-far));

    if(kind === 0){
      // 水滴。細い正弦が一瞬で落ちる
      var o = ctx.createOscillator(); o.type='sine';
      o.frequency.setValueAtTime(1900 + Math.random()*700, t);
      o.frequency.exponentialRampToValueAtTime(620, t+0.09);
      var g = ctx.createGain(); o.connect(g); g.connect(lp);
      env(g, t, 0.002, 0.10, amp*0.5);
      o.start(t); o.stop(t+0.2);
    }else if(kind === 1){
      // 遠くの扉。低い衝撃と、そのあとの残り
      var n = noiseSrc();
      var f = ctx.createBiquadFilter(); f.type='lowpass'; f.frequency.value=260; f.Q.value=1;
      var g2 = ctx.createGain(); n.connect(f); f.connect(g2); g2.connect(lp);
      env(g2, t, 0.004, 0.30, amp*0.9);
      n.start(t); n.stop(t+0.5);
      var o2 = ctx.createOscillator(); o2.type='sine';
      o2.frequency.setValueAtTime(58, t); o2.frequency.exponentialRampToValueAtTime(34, t+0.28);
      var g3 = ctx.createGain(); o2.connect(g3); g3.connect(lp);
      env(g3, t, 0.006, 0.26, amp*0.7);
      o2.start(t); o2.stop(t+0.5);
    }else if(kind === 2){
      // 配管を叩く音。金属的な倍音を 2 つ重ねる
      [1.0, 2.71].forEach(function(m, i){
        var o3 = ctx.createOscillator(); o3.type='triangle';
        o3.frequency.value = (430 + Math.random()*160) * m;
        var g4 = ctx.createGain(); o3.connect(g4); g4.connect(lp);
        env(g4, t, 0.002, 0.5 - i*0.2, amp*(i ? 0.20 : 0.45));
        o3.start(t); o3.stop(t+0.8);
      });
    }else{
      // 天井が落ち着く音。低い帯域の雑音がゆっくり出て消える
      var n2 = noiseSrc();
      var f2 = ctx.createBiquadFilter(); f2.type='bandpass';
      f2.frequency.value = 150 + Math.random()*120; f2.Q.value = 1.6;
      var g5 = ctx.createGain(); n2.connect(f2); f2.connect(g5); g5.connect(lp);
      env(g5, t, 0.18, 0.9, amp*0.5);
      n2.start(t); n2.stop(t+1.4);
    }
  }

  function creak(){
    if(!ready) return;
    var t = ctx.currentTime;
    var o = ctx.createOscillator(); o.type='sawtooth';
    var base = 90 + Math.random()*120;
    o.frequency.setValueAtTime(base, t);
    o.frequency.linearRampToValueAtTime(base*1.5, t+0.8);
    var f = ctx.createBiquadFilter(); f.type='bandpass'; f.frequency.value=700; f.Q.value=6;
    var g = ctx.createGain();
    o.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.3, 0.7, 0.06);
    o.start(t); o.stop(t+1.2);
  }
  /* 瓶が割れる音。高い帯域の雑音の粒を数発ばらまき、低い「ごつん」を下に敷く。
     距離で小さく、高域から先に削る */
  function glass(dist: number, pan: any){
    if(!ready) return;
    var t = ctx.currentTime;
    var att = 6 / (6 + dist);
    var out = ctx.createGain(); out.gain.value = 0.9 * att;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000 * att + 1200;
    var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    out.connect(lp);
    if(pn){ pn.pan.value = clamp(pan, -1, 1); lp.connect(pn); pn.connect(master); } else lp.connect(master);
    // 収録の瓶の割れる音。合成の破片は数を減らして上に散らす
    var gb = sfx('glass');
    if(gb) playSfx(gb, t, 0.92 + Math.random()*0.12, 1.1, out);
    for(var i=0; i<(gb ? 3 : 7); i++){
      var off = i * (0.012 + Math.random()*0.03);
      var n = ctx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 1.4 + Math.random();
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 9 + Math.random()*12;
      bp.frequency.value = 2600 + Math.random()*5200;
      var g = ctx.createGain();
      n.connect(bp); bp.connect(g); g.connect(out);
      env(g, t + off, 0.001, 0.05 + Math.random()*0.12, 0.5 - i*0.05);
      n.start(t + off); n.stop(t + off + 0.3);
    }
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.12);
    var og = ctx.createGain(); o.connect(og); og.connect(out);
    env(og, t, 0.002, 0.12, 0.35);
    o.start(t); o.stop(t + 0.2);
  }
  /* 患者の叫び（第 9 章 updatePatients）。女の声に寄せた鋸歯を 2 つの共鳴
     （900 / 2600 Hz）に通し、上ずってから崩れる。息の雑音を上に敷く */
  function shriek(dist: number, pan: any){
    if(!ready) return;
    var t = ctx.currentTime, dur = 1.5;
    var att = 7 / (7 + dist) * (settings.softScare ? 0.35 : 1);
    var out = ctx.createGain(); out.gain.value = 0.0001;
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.55 * att, t + 0.06);
    out.gain.setTargetAtTime(0.0001, t + dur*0.7, 0.18);
    var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if(pn){ pn.pan.value = clamp(pan, -1, 1); out.connect(pn); pn.connect(master); if(revSend) pn.connect(revSend); }
    else out.connect(master);
    var o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(560, t);
    o.frequency.exponentialRampToValueAtTime(1040, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(610, t + dur);
    var vib = ctx.createOscillator(); vib.frequency.value = 7.5;
    var vg = ctx.createGain(); vg.gain.value = 38; vib.connect(vg); vg.connect(o.frequency);
    [900, 2600].forEach(function(f, i){
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 5 + i*3;
      var g = ctx.createGain(); g.gain.value = i ? 0.5 : 1;
      o.connect(bp); bp.connect(g); g.connect(out);
    });
    var n = noiseSrc(); var nf = ctx.createBiquadFilter(); nf.type = 'highpass'; nf.frequency.value = 2400;
    var ng = ctx.createGain(); ng.gain.value = 0.22; n.connect(nf); nf.connect(ng); ng.connect(out);
    o.start(t); vib.start(t); n.start(t);
    o.stop(t + dur + 0.4); vib.stop(t + dur + 0.4); n.stop(t + dur + 0.4);
  }
  /* 天井裏の金属音（第4章 通気口）。薄い鋼板を叩いた鈍い響きを、
     頭の上から聞こえるように高域を削って鳴らす。loud は 0..1.2 */
  function clang(dist: number, pan: any, loud: any){
    if(!ready) return;
    var t = ctx.currentTime;
    var att = (8 / (8 + dist)) * (loud || 1);
    var out = ctx.createGain(); out.gain.value = 0.5 * att;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900 + 1400 * clamp(1 - dist/30, 0, 1);
    var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    out.connect(lp);
    if(pn){ pn.pan.value = clamp(pan, -1, 1) * 0.7; lp.connect(pn); pn.connect(master); if(revSend) pn.connect(revSend); }
    else lp.connect(master);
    // 収録の金属音を低く鳴らして芯にする（天井裏の鋼板・扉を押し開けた音）
    var mb = sfx(loud && loud > 0.8 ? 'plate' : 'metal');
    if(mb) playSfx(mb, t, 0.62 + Math.random()*0.1, 1.2, out);
    [118, 187, 263, 341].forEach(function(f, i){
      var o = ctx.createOscillator(); o.type = i ? 'sine' : 'triangle';
      o.frequency.value = f * (1 + (Math.random()-0.5)*0.03);
      var g = ctx.createGain(); o.connect(g); g.connect(out);
      env(g, t, 0.002, 0.25 + i*0.08, 0.5 / (i + 1));
      o.start(t); o.stop(t + 0.7);
    });
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    var nf = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 700; nf.Q.value = 1.5;
    var ng = ctx.createGain(); n.connect(nf); nf.connect(ng); ng.connect(out);
    env(ng, t, 0.001, 0.08, 0.6);
    n.start(t); n.stop(t + 0.15);
  }
  /* 囁き（第5章 映るもの）。子音だけの息の音を、話し声の帯域で短く刻む。
     近いほど大きく、残響を抜いて耳元で鳴らす */
  function whisper(dist: number, pan: any){
    if(!ready) return;
    var t = ctx.currentTime, att = 4 / (4 + dist);
    var out = ctx.createGain(); out.gain.value = 0.35 * att;
    var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if(pn){ pn.pan.value = clamp(pan, -1, 1); out.connect(pn); pn.connect(master); } else out.connect(master);
    var syl = 3 + ((Math.random()*3) | 0);
    for(var i=0; i<syl; i++){
      var off = i * (0.11 + Math.random()*0.07);
      var n = ctx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 0.9 + Math.random()*0.3;
      var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 4;
      bp.frequency.setValueAtTime(1800 + Math.random()*2600, t + off);
      bp.frequency.linearRampToValueAtTime(1200 + Math.random()*1800, t + off + 0.09);
      var g = ctx.createGain(); n.connect(bp); bp.connect(g); g.connect(out);
      env(g, t + off, 0.012, 0.07 + Math.random()*0.05, 0.9);
      n.start(t + off); n.stop(t + off + 0.25);
    }
  }
  /* 水しぶき（第6章）。自分の足（dist 0）にも、あれの足にも使う。
     低い「どぷ」と、高い帯域の飛沫を重ねる */
  function splash(dist: number, pan: any, vol: any){
    if(!ready) return;
    var t = ctx.currentTime, att = (dist > 0 ? 6 / (6 + dist) : 1) * (vol === undefined ? 1 : vol);
    if(att < 0.004) return;
    var out = ctx.createGain(); out.gain.value = 0.45 * att;
    var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if(pn){ pn.pan.value = clamp(pan || 0, -1, 1); out.connect(pn); pn.connect(master); if(revSend) pn.connect(revSend); }
    else out.connect(master);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(260 + Math.random()*80, t); o.frequency.exponentialRampToValueAtTime(90, t + 0.09);
    var og = ctx.createGain(); o.connect(og); og.connect(out); env(og, t, 0.004, 0.09, 0.5);
    o.start(t); o.stop(t + 0.15);
    var n = ctx.createBufferSource(); n.buffer = noiseBuf; n.playbackRate.value = 0.8 + Math.random()*0.4;
    var bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500 + Math.random()*1500; bp.Q.value = 0.8;
    var ng = ctx.createGain(); n.connect(bp); bp.connect(ng); ng.connect(out);
    env(ng, t + 0.01, 0.01, 0.22, 0.55);
    n.start(t); n.stop(t + 0.35);
  }
  /* 地下の水音。低いせせらぎを常に鳴らし、ときどき滴を落とす。
     これがあれの足音を覆い隠す */
  var waterNodes = (null as any), dripT = (null as any);
  function setWater(on: any){
    if(!ready) return;
    if(waterNodes){ waterNodes.forEach(function(n: any){ try{ n.stop(); }catch(e){} }); waterNodes = null; }
    if(dripT){ clearInterval(dripT); dripT = null; }
    if(!on) return;
    var n = noiseSrc();
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    var g = ctx.createGain(); g.gain.value = 0.10;
    var lf = ctx.createOscillator(); lf.frequency.value = 0.13;
    var lg = ctx.createGain(); lg.gain.value = 0.04; lf.connect(lg); lg.connect(g.gain);
    n.connect(lp); lp.connect(g); g.connect(master); if(revSend) g.connect(revSend);
    n.start(); lf.start();
    waterNodes = [n, lf];
    // 収録の水音と遠くのポンプ（地下。第 6 章）
    [['amb_water', 0.16, 3200], ['amb_pump', 0.08, 700]].forEach(function(e){
      var buf = sfx(e[0]); if(!buf) return;
      var s: any = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = e[2];
      var gg = ctx.createGain(); gg.gain.value = e[1];
      s.connect(f); f.connect(gg); gg.connect(master); if(revSend) gg.connect(revSend);
      s.start(); waterNodes.push(s);
    });
    dripT = setInterval(function(){
      if(!ctx || ctx.state !== 'running' || Math.random() < 0.4) return;
      var t = ctx.currentTime;
      var o = ctx.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(1400 + Math.random()*1600, t); o.frequency.exponentialRampToValueAtTime(600, t + 0.05);
      var gg = ctx.createGain(); var pn = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      o.connect(gg);
      if(pn){ pn.pan.value = Math.random()*2 - 1; gg.connect(pn); pn.connect(master); if(revSend) pn.connect(revSend); }
      else gg.connect(master);
      env(gg, t, 0.001, 0.06, 0.05 + Math.random()*0.05);
      o.start(t); o.stop(t + 0.1);
    }, 700);
  }
  /* 録音テープの声（第 11.5 節）。assets.js の voice/<名前>（MP3）を鳴らす時に初めて解く。
     7 本を最初に全部解くと 20MB 近い PCM を抱えることになる。
     声は画面の外の世界の音ではなく手元の再生機なので、部屋の返りも立体音響も通さず直に出す。
     鳴り始めたら cb(元の節点) を返す（止めるのに使う）。素材が無ければ false */
  var VOICE = ({} as Record<string, any>);
  function voice(key: string, cb: any){
    var A = window.W7_ASSETS;
    if(!ready || !A || !A[key]) return false;
    function go(buf: any){
      var s: any = ctx.createBufferSource(); s.buffer = buf;
      var g = ctx.createGain(); g.gain.value = 0.9;
      s.connect(g); g.connect(master); s.start(ctx.currentTime + 0.05);
      cb(s);
    }
    if(VOICE[key]){ go(VOICE[key]); return true; }
    try{
      var bin = atob(A[key].split(',')[1]), u8 = new Uint8Array(bin.length);
      for(var i=0; i<bin.length; i++) u8[i] = bin.charCodeAt(i);
      var pr = ctx.decodeAudioData(u8.buffer, function(buf: any){ VOICE[key] = buf; go(buf); }, function(){});
      if(pr && pr.catch) pr.catch(function(){});
    }catch(e){ return false; }
    return true;
  }
  return { voice:voice, setHRTF:setHRTF, setScore:setScore, glass:glass, shriek:shriek, clang:clang, whisper:whisper, splash:splash, setWater:setWater, resting:resting, scoreLevel:function(){ return scoreLevel; },
           init:init, resume:resume, suspend:suspend, state:audioState,
           sfxGroups:function(){ var o = ({} as Record<string, any>); Object.keys(SFX).forEach(function(k){ o[k] = SFX[k].length; }); return o; }, setVol:setVol, setSpace:setSpace, makeIR:makeIR,
           startAmbient:startAmbient, stopAmbient:stopAmbient, setTension:setTension,
           step:step, heart:heart, pickup:pickup, unlock:unlock, click:click, hunterStep:hunterStep,
           stinger:stinger, scream:scream, hurt:hurt, creak:creak, gasp:gasp,
           hunterVocal:hunterVocal, voxSpec:function(){ return VOX; },
           ambientOne:ambientOne,
           setHunterVoice:setHunterVoice, setLampVoice:setLampVoice, setExitVoice:setExitVoice,
           busCount:busCount, busState:busState,
           isReady:function(){ return ready; } };
})();


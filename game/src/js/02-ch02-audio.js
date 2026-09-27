/* =========================================================================
   2. オーディオ（全て手続き生成・外部ファイル無し）
   ========================================================================= */
var Audio2 = (function(){
  var ctx = null, master = null, noiseBuf = null;
  var drone = null, droneGain = null, droneFilt = null;
  var vol = 0.7, ready = false;
  var convolver = null, revSend = null, revWet = null;

  /* 残響のインパルス応答を書き込む。
     雑音に指数減衰を掛け、時間が経つほど高域を落とす（実際の部屋も
     高域から先に吸われる）。左右で別の雑音を引くので広がりが出る。
     NaN が 1 つでも混ざると畳み込みの出力が全部無音になり、
     しかも「静かなゲーム」なので気づけない。自己診断から呼べる形にしておく。 */
  function makeIR(out, sampleRate){
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
  makeIR.len = function(sampleRate){ return Math.floor(sampleRate * 1.9); };
  var REV_OPEN = 0.34, REV_BOX = 0.06;   // 廊下 / 箱の中

  function init(){
    if(ready) return true;
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC) return false;
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
    return true;
  }
  function resume(){
    if(!ready) return;
    if(ctx.state === 'suspended'){ ctx.resume().catch(function(){}); }
  }
  function suspend(){ if(ready && ctx.state === 'running'){ ctx.suspend().catch(function(){}); } }
  function setVol(v){ vol = v; if(master) master.gain.value = v; }
  /* 箱の中に入ると、耳のすぐ横に板がある。廊下と同じ返りが鳴っていると
     「隠れた」感じが出ない。入っている間だけ残響を絞る。 */
  function setSpace(inBox){
    if(!revWet || !ready) return;
    revWet.gain.setTargetAtTime(inBox ? REV_BOX : REV_OPEN, ctx.currentTime, 0.25);
  }

  function noiseSrc(){
    var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s;
  }
  function env(g, t0, a, d, peak){
    g.gain.cancelScheduledValues(t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002,peak), t0+a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0+a+d);
  }

  // 位置を持つ持続音のための共通バス（音量・左右・こもり具合を毎フレーム更新する）
  var buses = { hunter:null, lamps:[], exit:null };
  function makeBus(){
    var g = ctx.createGain(); g.gain.value = 0.0001;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
    lp.frequency.value = 800; lp.Q.value = 0.5;
    var sp = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    g.connect(lp);
    if(sp){ lp.connect(sp); sp.connect(master); } else { lp.connect(master); }
    return { in:g, gain:g, lp:lp, pan:sp, vol:0, panV:0, cut:800 };
  }
  function setBus(bus, vol, panV, cut){
    if(!bus || !ready) return;
    var t = ctx.currentTime;
    bus.vol = vol; bus.panV = panV; bus.cut = cut;
    bus.gain.gain.setTargetAtTime(Math.max(0.00001, vol), t, 0.12);
    bus.lp.frequency.setTargetAtTime(Math.max(120, cut), t, 0.16);
    if(bus.pan) bus.pan.pan.setTargetAtTime(clamp(panV, -1, 1), t, 0.09);
  }
  function setHunterVoice(v,p,c){ setBus(buses.hunter, v, p, c); }
  function setLampVoice(i,v,p,c){ setBus(buses.lamps[i], v, p, c); }
  function setExitVoice(v,p,c){ setBus(buses.exit, v, p, c); }
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
    // 空調のホワイトノイズ
    var n = noiseSrc();
    var nf = ctx.createBiquadFilter(); nf.type='bandpass'; nf.frequency.value=420; nf.Q.value=0.7;
    var ng = ctx.createGain(); ng.gain.value=0.05;
    n.connect(nf); nf.connect(ng); ng.connect(master); n.start();
    drone.push(n);

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
  }
  function stopAmbient(){
    if(!drone) return;
    try{ drone.forEach(function(o){ try{o.stop();}catch(e){} }); }catch(e){}
    drone = null; droneGain = null; droneFilt = null;
    buses.hunter = null; buses.lamps = []; buses.exit = null;
  }
  function setTension(t){ // 0..1
    if(!droneFilt) return;
    droneFilt.frequency.setTargetAtTime(260 + t*1500, ctx.currentTime, 0.35);
    if(droneGain) droneGain.gain.setTargetAtTime(0.5 + t*0.55, ctx.currentTime, 0.4);
  }

  /* 足音。mat は 0=柔らかい（埃・布）〜 1=硬い（タイル）。
     同じ音が延々と鳴っていると床がどこも同じに感じる。呼び出し側が
     その場所から決まる値を渡すので、同じ場所は毎回同じ音になる。 */
  function step(hard, mat){
    if(!ready) return;
    mat = (mat === undefined) ? 0.5 : clamp(mat, 0, 1);
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    n.playbackRate.value = 0.6 + mat*0.5 + Math.random()*0.4;
    var f = ctx.createBiquadFilter(); f.type='bandpass';
    f.frequency.value = 520 + mat*900 + Math.random()*380;
    f.Q.value = 1.0 + mat*1.4;
    var g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(master);
    // 硬い床ほど短く切れる
    env(g, t, 0.005, (hard?0.16:0.10) * (1.25 - mat*0.5), hard?0.28:0.16);
    n.start(t); n.stop(t+0.3);
    // 硬い床では踵の当たりが上に乗る
    if(mat > 0.55){
      var o = ctx.createOscillator(); o.type='triangle';
      o.frequency.setValueAtTime(2400 + Math.random()*900, t);
      var g2 = ctx.createGain(); o.connect(g2); g2.connect(master);
      env(g2, t, 0.001, 0.035, (hard?0.09:0.05) * (mat-0.55)/0.45);
      o.start(t); o.stop(t+0.08);
    }
  }
  function heart(intensity){
    if(!ready) return;
    var t = ctx.currentTime;
    function thump(off, amp){
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
  function click(on){
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
    var t = ctx.currentTime;
    var g = ctx.createGain(); g.connect(master);
    env(g, t, 0.01, 1.5, 0.3);
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
    var t = ctx.currentTime;
    var n = ctx.createBufferSource(); n.buffer = noiseBuf;
    var f = ctx.createBiquadFilter(); f.type='bandpass'; f.Q.value=1.1;
    f.frequency.setValueAtTime(2400, t);
    f.frequency.exponentialRampToValueAtTime(180, t+1.2);
    var g = ctx.createGain();
    n.connect(f); f.connect(g); g.connect(master);
    env(g, t, 0.008, 1.3, 0.5);
    n.start(t); n.stop(t+1.5);

    var o = ctx.createOscillator(); o.type='sawtooth';
    o.frequency.setValueAtTime(620, t);
    o.frequency.exponentialRampToValueAtTime(70, t+1.0);
    var og = ctx.createGain(); o.connect(og); og.connect(master);
    env(og, t, 0.01, 1.1, 0.28);
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
  function hunterVocal(kind, dist, pan, blocked){
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
  function stepAtten(dist){
    // 逆距離カーブ＋端の滑らかなフェード。急に鳴り出さず連続的に近づく
    var n = clamp(dist / STEP_MAX, 0, 1);
    return (6 / (6 + dist)) * (1 - n*n*n);
  }
  function hunterStep(dist, chasing, pan, blocked){
    if(!ready) return;
    var t = ctx.currentTime;
    var att = stepAtten(dist) * (blocked ? 0.55 : 1);
    if(att <= 0.0005) return;
    var n01 = clamp(dist / STEP_MAX, 0, 1);

    // 出口：距離に応じて左右へ振る（対応していない環境では素通し）
    var out = master;
    if(ctx.createStereoPanner){
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
  function ambientOne(kind, pan, far){
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
  return { init:init, resume:resume, suspend:suspend, setVol:setVol, setSpace:setSpace, makeIR:makeIR,
           startAmbient:startAmbient, stopAmbient:stopAmbient, setTension:setTension,
           step:step, heart:heart, pickup:pickup, unlock:unlock, click:click, hunterStep:hunterStep,
           stinger:stinger, scream:scream, hurt:hurt, creak:creak, gasp:gasp,
           hunterVocal:hunterVocal, voxSpec:function(){ return VOX; },
           ambientOne:ambientOne,
           setHunterVoice:setHunterVoice, setLampVoice:setLampVoice, setExitVoice:setExitVoice,
           busCount:busCount, busState:busState,
           isReady:function(){ return ready; } };
})();


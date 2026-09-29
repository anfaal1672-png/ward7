/* 仕上げ（ページの中で動く）。ゲームの描画面を WebGL2 で受け取り、フィルムの見た目に整えて 1920×1080 に描く。
   ・シネスコ（2.39:1）の帯、わずかなゲートの揺れ、端の乱れを隠す 3% の寄り
   ・色：暗部は青緑、明部は温かく、彩度を落とし、柔らかい S 字
   ・ハレーション（明るい所の周りに赤いにじみ）、周辺減光、明るさに応じたフィルムの粒子
   ・文字（2D canvas で組んだ層）をにじみ付きで重ねる。フェード・閃光
   window.W7G.frame(opts) を 1 コマごとに呼ぶ */
(function(){
  const W = 1920, H = 1080;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.id = 'w7grade';
  cv.style.cssText = 'position:fixed;left:0;top:0;width:1920px;height:1080px;z-index:2147483647;visibility:visible !important';
  document.documentElement.appendChild(cv);
  const gl = cv.getContext('webgl2', { preserveDrawingBuffer: true, antialias: false });
  const txt = document.createElement('canvas'); txt.width = W; txt.height = H;
  const tx = txt.getContext('2d');
  const VS = `#version 300 es
  in vec2 p; out vec2 uv; void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;
  const FS = `#version 300 es
  precision highp float; in vec2 uv; out vec4 o;
  uniform sampler2D uImg, uText; uniform float uHasImg, uTime, uFade, uFlash, uBand, uZoom, uGrain, uExpo, uSat;
  uniform vec2 uRes, uWeave;
  float hash(vec2 p){ p = fract(p*vec2(443.897,441.423)); p += dot(p, p.yx+19.19); return fract((p.x+p.y)*p.x); }
  vec3 img(vec2 q){ return texture(uImg, q).rgb; }
  vec3 grade(vec3 c){
    c *= uExpo;
    float l = dot(c, vec3(.2126,.7152,.0722));
    c = mix(vec3(l), c, uSat);
    vec3 cool = vec3(0.80, 0.98, 1.04), warm = vec3(1.07, 0.99, 0.86);
    c *= mix(cool, warm, smoothstep(0.18, 0.75, l));
    c += vec3(0.004, 0.018, 0.022) * (1.0 - smoothstep(0.0, 0.3, l));   // 黒は沈めすぎず青緑に
    c = clamp(c, 0., 1.);
    c = mix(c, c*c*(3.0-2.0*c), 0.45);
    return c;
  }
  void main(){
    vec2 px = uv*uRes;
    float bh = uBand/uRes.y, y0 = 0.5 - bh*0.5;
    vec3 col = vec3(0.0);
    if(uHasImg > 0.5 && uv.y > y0 && uv.y < 1.0 - y0){
      vec2 q = vec2(uv.x, (uv.y - y0)/bh);
      q = (q - 0.5)/uZoom + 0.5 + uWeave;
      q.y = q.y;                                   // 描画面は下が 0
      vec3 c = img(q);
      // ハレーション：周りの明るさの余りを赤くにじませる
      vec3 h = vec3(0.0); float r = 5.0/uRes.x;
      for(int i=0;i<12;i++){ float a = float(i)*0.5236; vec2 d = vec2(cos(a), sin(a)*uRes.x/uBand)*r*(1.0+float(i%3));
        vec3 s = img(q+d); h += max(s - 0.62, 0.0); }
      c += h/12.0 * vec3(1.0, 0.36, 0.20) * 1.6;
      col = grade(c);
      // 周辺減光
      vec2 v = (q - 0.5)*vec2(1.0, 0.75); col *= 1.0 - 0.62*pow(length(v)*1.35, 2.4);
    }
    // 文字（にじみ付き）
    vec4 t = texture(uText, vec2(uv.x, 1.0-uv.y));
    vec3 glow = vec3(0.0);
    for(int i=0;i<8;i++){ float a = float(i)*0.785; vec2 d = vec2(cos(a), sin(a))*6.0/uRes; glow += texture(uText, vec2(uv.x, 1.0-uv.y)+d).rgb; }
    col = col*(1.0 - t.a) + t.rgb + glow/8.0*0.35;
    // 粒子（暗部と中間で強く）
    float l = dot(col, vec3(.3,.59,.11));
    float g = (hash(px + fract(uTime*7.31)*vec2(913.1, 271.7)) - 0.5) * uGrain * (0.55 + 0.8*(1.0 - l)*l*2.0);
    col += g;
    col = col*uFade + uFlash;
    o = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;
  function sh(type, src){ const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  const pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
  gl.useProgram(pr);
  const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  function tex(unit){ const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0+unit); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); return t; }
  const tImg = tex(0), tTxt = tex(1);
  const U = n => gl.getUniformLocation(pr, n);
  gl.uniform1i(U('uImg'), 0); gl.uniform1i(U('uText'), 1);

  /* ---- 文字 ---- */
  const SERIF = '"Noto Serif CJK JP", "Noto Serif JP", serif', SANS = '"Noto Sans CJK JP", sans-serif';
  const ease = x => x <= 0 ? 0 : x >= 1 ? 1 : x*x*(3 - 2*x);
  function card(seg, t){
    const inT = seg.fast ? 0.12 : 0.9, outT = seg.fast ? 0.2 : 0.7;
    const a = Math.min(ease(t/inT), ease((seg.dur - t)/outT));
    const lines = seg.text, size = seg.small ? 40 : 58;
    tx.textAlign = 'center'; tx.textBaseline = 'middle';
    const cy = H/2 - (seg.sub ? 26 : 0);
    lines.forEach((ln, li) => {
      // 1 文字ずつ、間隔が少しずつ開きながら現れる
      tx.font = `600 ${size}px ${seg.small ? SANS : SERIF}`;
      const chars = [...ln], track = size*(0.18 + 0.05*t/seg.dur);
      const widths = chars.map(c => tx.measureText(c).width), total = widths.reduce((s, w) => s + w, 0) + track*(chars.length - 1);
      let x = W/2 - total/2;
      chars.forEach((c, i) => {
        const ci = seg.fast ? 1 : ease((t - 0.08*i)/0.6);
        tx.fillStyle = `rgba(222,212,196,${(a*ci).toFixed(3)})`;
        tx.fillText(c, x + widths[i]/2, cy + li*(size*1.5) + (1 - ci)*6);
        x += widths[i] + track;
      });
    });
    if(seg.sub){
      tx.font = `400 ${seg.small ? 30 : 26}px ${SANS}`; tx.fillStyle = `rgba(160,150,138,${(a*ease((t-0.6)/0.8)).toFixed(3)})`;
      tx.fillText(seg.sub, W/2, cy + lines.length*size*1.5 + 12);
    }
  }
  function title(seg, t){
    const a = Math.min(ease((t - 0.3)/1.4), ease((seg.dur - t)/0.8));
    tx.textAlign = 'center'; tx.textBaseline = 'middle';
    tx.font = `700 190px ${SERIF}`;
    // 本体：沈んだ赤。光の帯が左から右へ一度だけ走る
    tx.fillStyle = `rgba(150,22,20,${a.toFixed(3)})`; tx.fillText('WARD 7', W/2, H/2 - 40);
    const sx = -400 + (W + 800)*ease((t - 0.6)/2.2);
    tx.save(); tx.globalCompositeOperation = 'source-atop';
    const gr = tx.createLinearGradient(sx - 220, 0, sx + 220, 0);
    gr.addColorStop(0, 'rgba(255,170,150,0)'); gr.addColorStop(0.5, `rgba(255,190,170,${(0.85*a).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,170,150,0)');
    tx.fillStyle = gr; tx.fillRect(0, 0, W, H); tx.restore();
    tx.font = `600 54px ${SERIF}`; const b = ease((t - 1.6)/1.2)*a;
    const s = '第 七 病 棟';
    tx.fillStyle = `rgba(214,204,188,${b.toFixed(3)})`; tx.fillText(s, W/2, H/2 + 110);
    tx.font = `400 22px ${SANS}`; tx.fillStyle = `rgba(150,140,128,${(b*0.9).toFixed(3)})`;
    tx.fillText('W A R D   7', W/2, H/2 + 168);
  }

  let frameNo = 0;
  window.W7G = {
    /* opts: { img: canvas|null, seg, t（区間の中の秒）, T（全体の秒）, fade, flash, expo } */
    frame(o){
      frameNo++;
      tx.clearRect(0, 0, W, H);
      if(o.seg && o.seg.kind === 'card') card(o.seg, o.t);
      if(o.seg && o.seg.kind === 'title') title(o.seg, o.t);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, tTxt);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, txt);
      if(o.img){
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tImg);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, o.img);
      }
      gl.viewport(0, 0, W, H);
      gl.uniform1f(U('uHasImg'), o.img ? 1 : 0);
      gl.uniform1f(U('uTime'), o.T);
      gl.uniform1f(U('uFade'), o.fade == null ? 1 : o.fade);
      gl.uniform1f(U('uFlash'), o.flash || 0);
      gl.uniform1f(U('uBand'), 804);
      gl.uniform1f(U('uZoom'), 1.035);
      gl.uniform1f(U('uGrain'), o.img ? 0.075 : 0.05);
      gl.uniform1f(U('uExpo'), o.expo || 1.0);
      gl.uniform1f(U('uSat'), o.sat == null ? 0.74 : o.sat);
      gl.uniform2f(U('uRes'), W, H);
      // ゲートの揺れ（ごく小さい）
      gl.uniform2f(U('uWeave'), Math.sin(o.T*3.1)*0.0006 + Math.sin(o.T*11.7)*0.0003, Math.sin(o.T*2.3 + 1)*0.0008);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.finish();
    }
  };
})();

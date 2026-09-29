/* ショットごとの演出（ページの中で動く関数を文字列で持つ）。
   setup(A,S)   … 章が始まった直後に一度
   frame(A,S,t) … 毎コマ、ゲームを進める前（ゲームの状態を動かす）
   cam(A,S,t)   … 毎コマ、描く直前（映画のカメラ。null ならゲームの一人称カメラのまま）
                  { p:[x,y,z], l:[x,y,z], fov, hand }  hand=false で一人称の手とランプを隠す
   sub          … 1 コマを何枚に分けて撮るか（動きの速いショットは 2 にして重ねる＝モーションブラー） */
const common = `function(A,S){
  const pl=A.player, h=A.hunter;
  S.ease = x => x<=0?0:x>=1?1:x*x*(3-2*x);
  S.lerp = (a,b,k) => a+(b-a)*k;
  S.faceTo = function(tx,tz){ S.pre = function(){ h.group.rotation.y = Math.atan2(tx-h.x, tz-h.z); h.group.updateMatrixWorld(true); }; };
  S.P = { x:pl.x, z:pl.z, yaw:pl.yaw };
  S.fwd = { x:-Math.sin(pl.yaw), z:-Math.cos(pl.yaw) };
  S.noise = t => Math.sin(t*1.7)*0.6 + Math.sin(t*3.9+1.3)*0.3 + Math.sin(t*7.1+0.4)*0.1;
}`;
module.exports = {
  // 誰もいない廊下を、ランプの光と一緒に滑るように進む。途中で灯りが二度またたく
  corridor: { ch:0, seed:4242,
    setup:`function(A,S){ (${common})(A,S); A.cheats.invisible=true; }`,
    frame:`function(A,S,t){ const pl=A.player; pl.lamp = !((t>3.2&&t<3.34)||(t>3.52&&t<3.6)); A.hunter.x=999; A.hunter.z=999;
      const d=0.3+1.05*t; pl.x=S.P.x+S.fwd.x*d; pl.z=S.P.z+S.fwd.z*d; pl.vx=pl.vz=0; }`,
    cam:`function(A,S,t){ const d=0.3+1.05*t; const x=S.P.x+S.fwd.x*d, z=S.P.z+S.fwd.z*d, sw=S.noise(t)*0.06;
      return { p:[x - S.fwd.z*sw, 1.52-0.03*t, z + S.fwd.x*sw], l:[x+S.fwd.x*6 + S.fwd.z*0.3*Math.sin(t*0.5), 1.35, z+S.fwd.z*6 - S.fwd.x*0.3*Math.sin(t*0.5)], fov:62, hand:false }; }` },
  // 望遠で、廊下の奥に立つ影へゆっくり寄る。目だけが赤い
  reveal: { ch:0, seed:4242,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 10, 13); h.x=s.x; h.z=s.z; S.H={x:s.x,z:s.z}; h.mode='hunt';
      const dx=s.x-pl.x, dz=s.z-pl.z, L=Math.hypot(dx,dz); S.d={x:dx/L,z:dz/L,L}; S.faceTo(pl.x, pl.z); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; h.x=S.H.x; h.z=S.H.z; const k=0.3+0.55*S.ease(t/6);
      pl.x=S.P.x+S.d.x*k; pl.z=S.P.z+S.d.z*k; pl.vx=pl.vz=0; }`,
    cam:`function(A,S,t){ const k=0.3+0.55*S.ease(t/6); const x=S.P.x+S.d.x*k, z=S.P.z+S.d.z*k;
      return { p:[x, 1.48+S.noise(t)*0.006, z], l:[S.H.x, 1.75, S.H.z], fov:24-5*S.ease(t/6), hand:false }; }` },
  // 下から見上げて回り込む。背後から冷たい縁取りの光
  orbit: { ch:0, seed:4242,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 5, 7.5); h.x=s.x; h.z=s.z; S.H={x:s.x,z:s.z}; h.mode='hunt';
      S.base = Math.atan2(pl.x-s.x, pl.z-s.z); S.faceTo(pl.x, pl.z);
      const T=window.THREE; const rim=new T.SpotLight(0x9fc4ff, 5.5, 9, 0.5, 0.6, 1.4);
      rim.position.set(s.x - Math.sin(S.base)*2.4, 3.0, s.z - Math.cos(S.base)*2.4); rim.target.position.set(s.x, 1.7, s.z);
      A.gfx().scene.add(rim); A.gfx().scene.add(rim.target); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; h.x=S.H.x; h.z=S.H.z; const c=S.cam; if(c){ pl.x=c.p[0]; pl.z=c.p[2]; } pl.vx=pl.vz=0; }`,
    cam:`function(A,S,t){ const a=S.base - 0.95 + 1.55*S.ease(t/5); const r=2.7-0.25*t/5;
      const x=S.H.x+Math.sin(a)*r, z=S.H.z+Math.cos(a)*r;
      return S.cam={ p:[x, 0.72+0.1*t/5, z], l:[S.H.x, 1.95, S.H.z], fov:44, hand:false }; }` },
  // 顔。髪の隙間から覗く。わずかに手持ちの揺れ
  face: { ch:0, seed:4242,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 4, 7); h.x=s.x; h.z=s.z; S.H={x:s.x,z:s.z}; h.mode='chase';
      const dx=pl.x-s.x, dz=pl.z-s.z, L=Math.hypot(dx,dz); S.d={x:dx/L,z:dz/L}; S.faceTo(pl.x, pl.z); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; h.x=S.H.x; h.z=S.H.z; const c=S.cam; if(c){ pl.x=c.p[0]; pl.z=c.p[2]; } pl.vx=pl.vz=0; }`,
    cam:`function(A,S,t){ const r=1.9-0.4*S.ease(t/3); const hx=S.noise(t*2.1)*0.012, hy=S.noise(t*1.7+3)*0.01;
      return S.cam={ p:[S.H.x+S.d.x*r + hx, 1.9+hy, S.H.z+S.d.z*r], l:[S.H.x, 1.95, S.H.z], fov:32, hand:false }; }` },
  // 一人称。灯りがまたたいて消え、闇の奥から赤い目だけが近づいてくる
  dark: { ch:0, seed:4242,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 11, 14); S.H0={x:s.x,z:s.z}; h.mode='hunt';
      const dx=s.x-pl.x, dz=s.z-pl.z; S.L=Math.hypot(dx,dz); S.d={x:dx/S.L,z:dz/S.L};
      pl.yaw = Math.atan2(-dx, -dz); pl.viewYaw = pl.yaw; pl.pitch = 0.04; S.faceTo(pl.x, pl.z); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; pl.x=S.P.x; pl.z=S.P.z; pl.vx=pl.vz=0;
      pl.lamp = t<0.9 || (t>1.05&&t<1.15) || (t>1.3&&t<1.36);
      const k = S.L - (S.L-2.6)*S.ease((t-1.2)/3.0); h.x=S.P.x+S.d.x*k; h.z=S.P.z+S.d.z*k; }`,
    cam:null },
  // 走って迫る。カメラは主人公の少し後ろの低い位置に据え、追跡者がレンズへ突っ込んでくる
  sprint: { ch:0, seed:4242, sub:2, warm:30,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter;
      const s=A.findLOSSpot(pl.x, pl.z, 13, 17); h.x=s.x; h.z=s.z; h.mode='chase'; h.memT=9; h.spawnGrace=0; h.lastSeen={x:pl.x,z:pl.z};
      const dx=s.x-pl.x, dz=s.z-pl.z, L=Math.hypot(dx,dz); S.d={x:dx/L,z:dz/L}; }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; pl.x=S.P.x; pl.z=S.P.z; pl.vx=pl.vz=0; h.mode='chase'; h.memT=9; h.lastSeen={x:pl.x,z:pl.z}; }`,
    cam:`function(A,S,t){ const h=A.hunter; const n=S.noise(t*4);
      const cx=S.P.x-S.d.x*0.7 - S.d.z*n*0.04, cz=S.P.z-S.d.z*0.7 + S.d.x*n*0.04;
      return { p:[cx, 1.25+S.noise(t*5+2)*0.03, cz], l:[h.x, 1.55, h.z], fov:48-6*S.ease(t/2.5), hand:false }; }` },
  // 捕まる（一人称）
  grab: { ch:0, seed:4242, warm:12,
    setup:`function(A,S){ (${common})(A,S); const pl=A.player, h=A.hunter; A.cheats.freeze=true; A.cheats.godmode=false;
      h.x=pl.x-Math.sin(pl.yaw)*1.8; h.z=pl.z-Math.cos(pl.yaw)*1.8; S.faceTo(pl.x, pl.z); }`,
    frame:`function(A,S,t,f){ if(f===1) A.act('lose'); }`,
    cam:null },
};

// 各ショット：setup(A,S) は一度、frame(A,S,t,f) は毎コマ（ページの中で実行される）。S.pre(A) は描画の直前
const face = `function(A,S){ const pl=A.player, h=A.hunter; S.look=function(tx,tz){ pl.yaw=Math.atan2(-(tx-pl.x), -(tz-pl.z)); pl.viewYaw=pl.yaw; };
  S.faceH=function(sign){ S.pre=function(){ h.group.rotation.y=Math.atan2((pl.x-h.x)*(sign||1), (pl.z-h.z)*(sign||1)); h.group.updateMatrixWorld(true); }; }; }`;
module.exports = {
  // 1. 廊下を進む（第1章）
  corridor: { ch:0, dur:6.5,
    setup:`function(A,S){ A.cheats.invisible=true; const pl=A.player; S.x=pl.x; S.z=pl.z; S.y=pl.yaw; pl.pitch=-0.04; }`,
    frame:`function(A,S,t){ const pl=A.player; const fx=-Math.sin(S.y), fz=-Math.cos(S.y);
      pl.x=S.x+fx*t*0.75; pl.z=S.z+fz*t*0.75; pl.yaw=S.y+Math.sin(t*0.6)*0.05; pl.vx=pl.vz=0; A.hunter.x=999; A.hunter.z=999; }` },
  // 2. 廊下の奥に立つ（押し込み）
  reveal: { ch:0, dur:5.5,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 8, 11); h.x=s.x; h.z=s.z; S.x0=pl.x; S.z0=pl.z; S.hx=s.x; S.hz=s.z; h.mode='hunt'; S.faceH(); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; const k=t*0.35; const dx=S.hx-S.x0, dz=S.hz-S.z0, L=Math.hypot(dx,dz);
      pl.x=S.x0+dx/L*k; pl.z=S.z0+dz/L*k; h.x=S.hx; h.z=S.hz; S.look(S.hx,S.hz); pl.pitch=0.06; pl.vx=pl.vz=0; }` },
  // 3. 歩いて近づいてくる（探索）
  approach: { ch:0, dur:5, warm:24,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true;
      const s=A.findLOSSpot(pl.x, pl.z, 12, 16); h.x=s.x; h.z=s.z; h.mode='hunt'; h.lastSeen={x:pl.x,z:pl.z}; h.memT=9; h.spawnGrace=0; S.px=pl.x; S.pz=pl.z; }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; pl.x=S.px; pl.z=S.pz; pl.vx=pl.vz=0; h.mode='hunt'; h.lastSeen={x:S.px,z:S.pz};
      S.look(h.x,h.z); pl.pitch=0.03; }` },
  // 4. 顔
  face: { ch:0, dur:3.5,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 4, 7); S.hx=s.x; S.hz=s.z; h.mode='chase'; S.faceH(); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; h.x=S.hx; h.z=S.hz; const d=1.9-t*0.16; const dx=pl.x-S.hx, dz=pl.z-S.hz, L=Math.hypot(dx,dz)||1;
      pl.x=S.hx+dx/L*d; pl.z=S.hz+dz/L*d; S.look(S.hx,S.hz); pl.pitch=0.26; pl.vx=pl.vz=0; }` },
  // 5. 灯りを消す：闇の中で目だけが光る
  dark: { ch:0, dur:4.5,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; A.cheats.invisible=true; A.cheats.freeze=true;
      const s=A.findLOSSpot(pl.x, pl.z, 9, 12.5); S.hx=s.x; S.hz=s.z; h.mode='hunt'; S.faceH(); }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; h.x=S.hx; h.z=S.hz; S.look(S.hx,S.hz); pl.pitch=0.05; pl.vx=pl.vz=0;
      pl.lamp = t < 1.2; }` },
  // 6. 追われる（走って迫る）
  chase: { ch:0, dur:3.2, warm:12,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; const s=A.findLOSSpot(pl.x, pl.z, 11, 14); h.x=s.x; h.z=s.z;
      h.mode='chase'; h.memT=9; h.lastSeen={x:pl.x,z:pl.z}; h.spawnGrace=0; S.px=pl.x; S.pz=pl.z; }`,
    frame:`function(A,S,t){ const pl=A.player, h=A.hunter; pl.x=S.px; pl.z=S.pz; pl.vx=pl.vz=0; h.mode='chase'; h.memT=9; h.lastSeen={x:pl.x,z:pl.z};
      S.look(h.x,h.z); pl.pitch=0.05; }` },
  // 7. 捕まる
  death: { ch:0, dur:2.6, warm:12,
    setup:`function(A,S){ (${face})(A,S); const pl=A.player, h=A.hunter; A.cheats.freeze=true; A.cheats.godmode=false;
      h.x=pl.x-Math.sin(pl.yaw)*1.8; h.z=pl.z-Math.cos(pl.yaw)*1.8; S.faceH(); }`,
    frame:`function(A,S,t,f){ if(f===2) A.act('lose'); }` },
};

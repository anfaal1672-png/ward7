// 追う側モードが実際に動くか。人間の入力を模して追跡者を歩かせ、
// 逃げる側（ボット）が普段どおり動いていることを見る。
const H=require('./harness.js'); const A=H.window.__WARD7;
H.resetTime(); A.toTitle(); A.skipUI(true); A.seed(9200); A.playAs('hunter'); A.botOn(true);
A.settings.diff=0; A.start(); H.pump(2);
const p=A.player,h=A.hunter,cam=A.camera;
console.log('モード', A.playAs(), ' 分身', A.avatarRef()?'あり':'なし');
const h0={x:h.x,z:h.z}, p0={x:p.x,z:p.z};
let camOK=0, botMoved=0, huntMoved=0, atk=0, hp0=p.hp;
for(let k=0;k<600;k++){
  // 前進しつつ、右へ視点を振る（人間の操作を模す）
  A.humanKeys.KeyW=true; A.humanKeys.ShiftLeft=(k%3===0);
  A.input.lookX = 2.0;               // 右半分ドラッグ相当
  const bx=p.x,bz=p.z,hx=h.x,hz=h.z;
  H.pump(6);
  botMoved += Math.hypot(p.x-bx,p.z-bz);
  huntMoved += Math.hypot(h.x-hx,h.z-hz);
  if(Math.abs(cam.position.x-h.x)<0.01 && Math.abs(cam.position.z-h.z)<0.01) camOK++;
  if(p.hp<hp0){ atk++; hp0=p.hp; }
  if(A.state()!==2) break;
}
console.log('カメラが追跡者に乗っている割合', (camOK/600*100).toFixed(0)+'%');
console.log('追跡者の移動距離', huntMoved.toFixed(1),'m   逃げる側(ボット)の移動距離', botMoved.toFixed(1),'m');
console.log('追跡者の向き yaw', h.yaw.toFixed(2), ' 攻撃が当たった回数', atk);
console.log('逃げる側の進行 カルテ', p.got+'/'+p.need, ' HP', Math.round(p.hp), ' 状態', A.state());
console.log('壁にめり込んでいないか:', A.losTest(h.x,h.z,h.x,h.z) ? 'OK' : '要確認');

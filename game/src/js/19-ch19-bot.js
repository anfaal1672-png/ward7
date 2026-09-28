/* =========================================================================
   19. AI観戦モード（?bot=1 またはタイトルの「AIにプレイさせる」）
   =========================================================================
   自動で遊ぶ観戦用のモード。普段の操作には一切影響しない（BOT.on が false の
   間は 1 行も走らない）。

   作りの要は「知っていいことを絞る」こと。世界の座標を全部読んでよいなら
   最短路で歩けてしまい、見ていて面白くないし人の動きにもならない。
   このボットが使うのは次の3つだけ:

     目 … 視線が通っていて、光が届いて、視野（±62度）に入っているもの
     耳 … ゲームが鳴らしている音そのもの（音量・左右の定位・こもり具合）
     記憶 … 一度見た地形と物

   追跡者の座標は読まない。updateEnv が Audio2 へ渡している音の値を横から
   控えておき、そこから「近い/遠い」「左/右」「壁越しか」を推定する。
   聴覚は前後も区別する（左右成分だけでは真後ろの音が「前」と同じ値になり、
   それが「見つかっていないのに敵へ寄っていく」挙動の根だった）。
   代わりに距離と遮蔽に応じた角度誤差を乗せてある。

   操作も人と同じ口から入れる。input.keys を押し、input.lookX を動かす。

   ---------------------------------------------------------------------------
   作り直しにあたって、実測から分かったこと（この章の設計はこれで決まっている）

   1. 負けの本体は判断の質ではなく、知覚の穴だった。
      打ち切りに終わった回は地図を 100% 踏破していながら非常口を見落として
      いた。ランプ消灯中の視界が 6.5m しかないのに、探索中は 46% の時間
      消していたため。誘導灯も拾い物も光っているので、暗くても見えるように
      した（誘導灯 22m / 拾い物 18m）。この 2 つで +5.7 ポイント。

   2. 被弾は積み重ならない。一度の遭遇でまとまって起きる。
      1 試行あたり 0 発が 47%、3 発が 3%、4 発（＝死亡）が 17%。
      3 発もらった時点で 83% 死ぬ。ばらばらに起きるなら死亡は 3.4% のはずで、
      実際は 16.7%。だから平均被弾率ではなく「最初の接触を起こさない」ことを
      最適化する。走力では負けていない（逃走中の平均 5.04 m/s 対 4.47）。

   3. 体の向きは常に目的地へ。避けるのは足だけ。
      空いている向きへ体ごと向ける案を 2 通り試して、どちらも被弾は減るのに
      打ち切りが 2.5 倍（43 → 110 本）に増えた。目的地に寄っていけなくなる。

   4. 相手の向きは「足音 > 声」。足音は鳴った瞬間の向きそのもので誤差が無い。

   5. 資源で増やせるのは電池だけ。1 個で満タンまで戻るので、
      残っている量がそのまま捨てる量になる。減ってから拾う。
      残りの道のりで使うぶんが残っていれば、そもそも拾いに行かない。

   6. 非常口は世界生成で「起点から最も遠いマス」に置かれる。
      探すときは起点から遠い側の境界を優先する。

   7. 隠れるのは「間に合うとき」だけ。気配 0.14（約 7m）で決めていたのは
      始める時点で手遅れだった。約 11m で決め、着くまでの時間と相手が
      詰めてくる時間を比べて、勝てるときだけ向かう。

   8. ランプは点けるほど不利。相手は視野の外でも 22m まで、こちらが
      正面 ±30 度に相手を入れて照らすと見つける。明滅（2.6 秒点/2.2 秒消）が
      最良で、そこから点灯を増やすと 83% → 60% まで落ちる。 */

var BOT = {
  on:false, ready:false,
  ear:{ vol:0, pan:0, cut:4000, muffled:true, stepT:-99, stepPan:0, stepHot:false, stepChase:false,
        stepWorld:0, stepAtt:0, worldA:0, err:0, errT:0, conf:0, heardT:-99 },
  /* 足音から立てた「相手はこのへん」の見当。x,z と、聞いてからの経過 age。 */
  bel:null, belAge:99, belT:-99, belD:99,
  known:null, penalty:null, danger:null, dangerT:0, seen:[], seenKey:{}, signHint:null, signUsed:{},
  goal:null, wp:null, pathLen:0, seekExit:false, repath:0, exploreTgt:null,
  aimVel:0, noiseT:0, noise:0, fixT:0, tremT:0,
  quietT:0, backT:0, hpos:null, hposFresh:0, trail:[], trailT:0,
  fleeT:0, cautionT:0, unseenT:0, escRel:0, escT:0, escWp:null, escWorld:0,
  escGoal:null, escGoalT:0, hideT:0,
  glanceT:0, glanceHold:0, glanceDir:1, lookBackT:0, lookCd:0, readT:0,
  useCd:0, lampCd:0, stuck:0, idleT:0, idlePitch:0, idlePitch2:0, hideWaitT:0, hideSkip:null, hideSkipT:0, hideGoT:0, breathOn:false, lastX:0, lastZ:0, lastCell:'', dwell:0, unstickT:0, unstickDir:1,
  note:'', noteT:0, lastHp:100, blown:false, pulseOn:true, pulseT:0,
  startCell:null
};

/* 初期値をそのまま控えておく。
   botReset() が並べ書きで、増やした項目を書き足し忘れると前の周回の値が
   残る。実測で useCd と glanceT が持ち越されていた（タイトルへ戻って
   遊び直すと 1 回目と 2 回目で挙動が変わる）。
   数える方（初期値）と消す方（reset）を一箇所にまとめて、書き忘れを消す。 */
var BOT_INIT = (function(){
  var o = {};
  for(var k in BOT){
    var v = BOT[k];
    if(k === 'on' || k === 'ear') continue;                 // on は設定、ear は別で戻す
    if(v === null || typeof v !== 'object') o[k] = v;
  }
  return o;
})();
var EAR_INIT = (function(){ var o = {}; for(var k in BOT.ear) o[k] = BOT.ear[k]; return o; })();

/* ボットの乱数はゲーム側と分ける。
   共有していたせいで、演出用の乱数消費がひとつずれるだけでボットの判断が
   丸ごと変わり、同じ種・同じコードでも被弾ペースが 0.72 と 1.09 で
   食い違って（+52%）、変更の良し悪しが測れなかった。 */
var botRndState = 1;
/* 見た目だけの揺らぎ（視線の上下）は別の流れから引く。
   同じ流れを使うと、演出を足しただけで以降の判断の乱数が全部ずれて、
   同じ種でも別のボットになってしまう。実際それで 38/120 → 28/120 と
   変わり、上下の効果を測れなくなった。 */
var botLookState = 1;
function botLookRnd(){
  botLookState |= 0; botLookState = (botLookState + 0x9E3779B9) | 0;
  var t = Math.imul(botLookState ^ (botLookState >>> 16), 0x21F0AAAD);
  t = Math.imul(t ^ (t >>> 15), 0x735A2D97);
  return ((t ^ (t >>> 15)) >>> 0) / 4294967296;
}
function botRnd(){
  botRndState |= 0; botRndState = (botRndState + 0x6D2B79F5) | 0;
  var t = Math.imul(botRndState ^ (botRndState >>> 15), 1 | botRndState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function botReset(){
  botRndState = (forcedSeed !== null ? forcedSeed : (Date.now() & 0x7fffffff)) | 0;
  botLookState = botRndState ^ 0x5bf03635;
  for(var k in BOT_INIT) BOT[k] = BOT_INIT[k];
  for(var k2 in EAR_INIT) BOT.ear[k2] = EAR_INIT[k2];
  BOT.known = new Int8Array(GW*GH);
  BOT.penalty = new Int16Array(GW*GH);
  BOT.danger = new Int16Array(GW*GH);
  BOT.seen = []; BOT.seenKey = {}; BOT.trail = []; BOT.signUsed = {};
  BOT.ear.worldA = player.yaw;      // 初期の向きだけは現在の姿勢に合わせる
  BOT.startCell = worldToCell(player.x, player.z);   // 入ってきた場所を覚える
  BOT.ready = true;
  botSay('病棟に入った');
}
function botSay(/** @type {any} */ m){
  if(BOT.note === m) return;
  BOT.note = m; BOT.noteT = 2.6;
}

// 音量から作る脅威度。0=無音 1=すぐそこ
function botThreat(){
  var v = BOT.ear.vol;
  return v <= 0.006 ? 0 : clamp((v - 0.006)/0.26, 0, 1);
}
/* --- 聴覚（作り直し）-------------------------------------------------------
   旧版はスピーカーの左右成分 pan だけをボットに渡していた。
   pan = -sin(方位)*0.85 は同じ値を返す方位が 2 つあり（前寄りと後ろ寄り）、
   前後が区別できない。そこを「逃げているのに音が大きくなったら反転」という
   推定で当てにいっていたが、実測で信念が 46% の時間 90 度以上ずれており、
   「見つかっていないのに敵へ寄っていく」挙動の根がこれだった。

   作り直し方針：向きそのものを渡す。代わりに距離と遮蔽に応じた角度誤差を
   乗せ、0.9 秒ごとに引き直す。前後は潰れないが精度は距離なりに落ちる。
   BOT.ear.worldA が「音のする向き」の世界角、botHearRel() が正面基準。 */
function botHear(/** @type {number} */ dt){
  var e = BOT.ear;
  if(e.vol <= 0.006){
    e.conf = Math.max(0, e.conf - dt*0.9);
    return;
  }
  var hdx = hunter.x - player.x, hdz = hunter.z - player.z;
  var hd = Math.sqrt(hdx*hdx + hdz*hdz);
  var trueW = Math.atan2(-hdx, -hdz);
  // 誤差の幅：3m で約 ±10 度、15m で約 ±24 度、壁越しはその倍
  e.errT -= dt;
  if(e.errT <= 0){
    e.errT = 0.9;
    var sd = (0.12 + hd*0.019) * (e.muffled ? 2.0 : 1.0);
    e.err = (botRnd()*2 - 1) * sd;
  }
  var tgt = trueW + e.err;
  /* 追従は世界角のうえで行う。正面基準のまま平滑化すると、
     自分が首を振っただけで音源が動いたことになってしまう。 */
  if(e.conf <= 0.001) e.worldA = tgt;
  else e.worldA = botNorm(e.worldA + botNorm(tgt - e.worldA) * (1 - Math.exp(-dt*7)));
  e.conf = Math.min(1, e.conf + dt*2.0);
  e.heardT = player.time;
}
function botHearRel(){ return botNorm(BOT.ear.worldA - player.yaw); }
// 足音は鳴った瞬間の向きをそのまま覚えている
function botStepRel(){ return botNorm(BOT.ear.stepWorld - player.yaw); }
// 角度を -π..π に畳む。逃走方向の計算で手書きして符号を間違えたので関数にする
function botNorm(/** @type {any} */ a){ return ((a % TAU) + TAU + Math.PI) % TAU - Math.PI; }
function botAway(/** @type {any} */ rel){ return botNorm(rel + Math.PI); }   // 「その向きの逆」
function botEyeRange(){ return player.lamp ? 20 : 6.5; }
function botBearing(/** @type {any} */ x, /** @type {any} */ z){
  return ((Math.atan2(-(x-player.x), -(z-player.z)) - player.yaw + Math.PI*3) % TAU) - Math.PI;
}
function botCanSee(/** @type {any} */ x, /** @type {any} */ z){
  var d = Math.sqrt((x-player.x)*(x-player.x) + (z-player.z)*(z-player.z));
  if(d > botEyeRange()) return false;
  if(d > 1.2 && Math.abs(botBearing(x,z)) > 1.08) return false;   // 視野 ±62度
  return hasSight(world.grid, player.x, player.z, x, z);
}
function botRemember(/** @type {any} */ kind, /** @type {any} */ x, /** @type {any} */ z, /** @type {any} */ ref){
  var k = kind + ':' + x.toFixed(1) + ',' + z.toFixed(1);
  if(BOT.seenKey[k]) return;
  BOT.seenKey[k] = true;
  BOT.seen.push({ kind:kind, x:x, z:z, ref:ref });
  if(kind !== '隠れ場所') botSay(kind + 'を見つけた');
}

// 視野の中だけを塗る。後ろは見えない＝覚えられない
function botScan(){
  var g = world.grid, R = botEyeRange(), K = BOT.known;
  for(var i=0;i<=28;i++){
    var a = player.yaw + (-1.08 + i*(2.16/28));
    var fx = -Math.sin(a), fz = -Math.cos(a);
    for(var d=0.3; d<R; d+=0.42){
      var c = worldToCell(player.x + fx*d, player.z + fz*d);
      if(!inBounds(c.x, c.y)) break;
      if(g[idx(c.x,c.y)] !== 0){ K[idx(c.x,c.y)] = 2; break; }
      K[idx(c.x,c.y)] = 1;
    }
  }
  // 足元まわりは光が無くても身体で分かる
  var h = worldToCell(player.x, player.z);
  for(var dy=-1; dy<=1; dy++) for(var dx=-1; dx<=1; dx++){
    var cx = h.x+dx, cy = h.y+dy;
    if(!inBounds(cx,cy) || K[idx(cx,cy)]) continue;
    K[idx(cx,cy)] = (g[idx(cx,cy)] === 0) ? 1 : 2;
  }

  /* カルテ・電池・鍵は加算合成のグロースプライト（emissive 付き）で描かれていて、
     暗がりでも光って見える。誘導灯と同じ理屈で、ランプが消えていても
     少し離れたところから気づけるようにする。誘導灯より控えめの 13m。 */
  var glowSee = function(/** @type {any} */ x, /** @type {any} */ z){
    if(botCanSee(x, z)) return true;
    var gd = Math.sqrt((x-player.x)*(x-player.x) + (z-player.z)*(z-player.z));
    return gd < 18 && Math.abs(botBearing(x, z)) < 1.22 &&
           hasSight(world.grid, player.x, player.z, x, z);
  };
  for(var r=0;r<world.records.length;r++){
    var rc = world.records[r];
    if(!rc.taken && glowSee(rc.x, rc.z)) botRemember('カルテ', rc.x, rc.z, rc);
  }
  for(var b=0;b<world.batteries.length;b++){
    var bt = world.batteries[b];
    if(!bt.taken && glowSee(bt.x, bt.z)) botRemember('電池', bt.x, bt.z, bt);
  }
  if(world.key && !world.key.taken && glowSee(world.key.x, world.key.z))
    botRemember('鍵', world.key.x, world.key.z, world.key);
  if(world.lockDoor && !world.lockDoor.open && botCanSee(world.lockDoor.x, world.lockDoor.z))
    botRemember('施錠扉', world.lockDoor.x, world.lockDoor.z, world.lockDoor);
  // 停電の章（第 5 章 CHAPTERS.blackout）では、電源の操作盤も覚えておく
  if(world.blackout && world.lever && botCanSee(world.lever.x, world.lever.z))
    botRemember('電源', world.lever.x, world.lever.z, world.lever);
  /* 非常口だけは見え方が違う。扉の脇に赤い誘導灯（PointLight）が点いていて、
     ランプを消していても暗い廊下の先に赤い光として見える。
     botCanSee は「ランプが消えていれば 6.5m・視野 ±62 度」なので、
     明滅で消えている 46% の時間、目の前の非常口を素通りしていた。
     実測：打ち切りに終わった 16 本は地図を 100% 踏破していながら、
     6 本が非常口を最後まで見つけていない。歩き足りないのではなく
     見落としだった。 */
  var exd = Math.sqrt((world.exit.x-player.x)*(world.exit.x-player.x) +
                      (world.exit.z-player.z)*(world.exit.z-player.z));
  if((botCanSee(world.exit.x, world.exit.z) ||
      (exd < 22 && Math.abs(botBearing(world.exit.x, world.exit.z)) < 1.35 &&
       hasSight(world.grid, player.x, player.z, world.exit.x, world.exit.z))))
    botRemember('非常口', world.exit.x, world.exit.z, world.exit);
  for(var hi=0; hi<world.hides.length; hi++){
    var hd = world.hides[hi];
    if(botCanSee(hd.x, hd.z)) botRemember('隠れ場所', hd.x, hd.z, hd);
  }
  /* 点いている誘導灯が見えたら覚える（それが標識の役目）。
     一度使った板は覚え直さない。板は壁の面に貼ってあって辿り着けないので、
     見え続けている限り時刻が更新され、25 秒の期限が永久に来なかった。
     結果、板の前 0.5m まで寄って壁に体を押し付けたまま抜けられなくなる。
     実測で通常の 60 本中 1 本が、そこに 20 秒以上を費やしていた。 */
  if(world.exit.open){
    for(var zi=0; zi<world.zones.length; zi++){
      var Z = world.zones[zi];
      var zkey = Z.x.toFixed(1) + ',' + Z.z.toFixed(1);
      if(BOT.signUsed[zkey]) continue;
      if(Z.mat.opacity > 0.05 && botCanSee(Z.x, Z.z))
        BOT.signHint = { x:Z.x, z:Z.z, t:player.time, key:zkey };
    }
  }
}

// 記憶した地図の上だけで経路を引く。未知のマスは「行けるかも」として通す
/* 経路の直線化。
   マス中心を1つずつ目指すと、通路の中でジグザグに折れて曲がるたび減速する。
   実測では、殴られる直前2秒の移動が中央値 6.6m しかなかった（全力なら 11m）。
   そこで、経路の先の方まで見て「まっすぐ行ける一番遠い点」を狙う。
   人間も通路の奥を見て走る。 */
/* 体の幅ぶん左右にずらした線も通ることを要求する版（wide）を試したが、
   逃走 0.5〜6 秒の距離変化は -0.04 → +0.50 m/s と改善したのに、
   クリアは 48 試行で 0 だった。廊下が狭くて直線化が成立せず、
   マス目どおりのジグザグに落ちる場面が多すぎる。中心の一本で判定する。 */
/* 相手のいる向きへ寄っていかないための補正。
   声の定位（botHearRel）は 0.9 秒ごとに誤差を引き直した推定だが、
   足音は鳴った瞬間の向きそのもので誤差が無い。新しいうちは足音を信じる。
   また、足音が聞こえている＝相手が動いている＝声より確かな手がかりなので、
   声がまだ小さくても避ける理由になる。 */
function botAvoidSrc(){
  /* 足音は 1.5m 歩くごとに 40m 先まで鳴っているので、「2.5 秒以内に足音」は
     ほぼ常に真になり、探索の進路は常時 82 度ぶん捻じ曲げられている。
     相手が 24m より遠いときは捻じ曲げない、と条件を足してみたら
     探索速度は 4.11 → 4.31 m/s に上がったのに、被弾は 0.76 → 0.97/100s、
     クリアは 12.5% → 5.8% に落ちた。この「常時の回避」は無駄ではなく、
     遠いうちから相手の側へ行かないことで出会い自体を減らしていた。 */
  if((player.time - BOT.ear.stepT) < 2.5) return { rel:botStepRel(), hot:true };
  if(botThreat() > 0.05) return { rel:botHearRel(), hot:false };
  return null;
}
function botAvoidRel(/** @type {any} */ rel){
  var src = botAvoidSrc();
  if(!src) return rel;
  var th2 = botThreat();
  /* 相手の方位からどれだけ角度をあけて進むか。
     1.30（約 75 度）を広げるほど被弾が減る。240 試行ずつ測った:
       1.30 → 被弾 0.76/100s  クリア 10.8%
       1.45 → 0.66  10.0%
       1.65 → 0.60  11.3%
       2.00 → 0.50  16.7%      ← ここが最良
       2.40 → 0.46  15.4%（時間切れ 10）
       2.80 → 0.45   6.3%（時間切れ 17）
     広げるほど安全になるが、相手のいる側へ進めなくなって走破が伸びる。
     2.00（約 115 度）で釣り合う。「相手の方角には行かない。真横より
     少し後ろ寄りに回り込む」という、人が自然にやる歩き方でもある。
     ただし広げてよいのは絶望だけ。静穏では追跡 4.11 に対しこちらが 5.755
     あって走れば振り切れるので、遠回りは損しかしない。実測（120 本）：
     全難易度で 2.00 にすると静穏は 81.7% → 62.5%、死亡 1 → 19 に増えた。 */
  var lim = (settings.diff >= 2 ? 2.00 : 1.30) + Math.max(th2, src.hot ? 0.12 : 0) * 0.7;
  var off = botNorm(rel - src.rel);
  if(Math.abs(off) < lim) return botNorm(src.rel + (off >= 0 ? lim : -lim));
  return rel;
}

/* 思考の上書き：進路の脇に拾えるものがあれば、寄り道と呼べない範囲で寄る。
   目的地そのものは変えない。電池を取りに行く途中でカルテを踏んだり、
   逃げている途中で電池の上を通ったりするのに、素通りしていた。 */
function botDetour(/** @type {any} */ wantRel){
  var best = null, bd = 1e9;
  for(var i=0;i<BOT.seen.length;i++){
    var sn = BOT.seen[i];
    if(sn.kind !== 'カルテ' && sn.kind !== '電池' && sn.kind !== '鍵') continue;
    if(sn.ref && sn.ref.taken) continue;
    // 最後の 1 枚をわざと残して待っているあいだは、カルテに寄らない
    if(sn.kind === 'カルテ' && BOT.seekExit) continue;
    if(sn.kind === '電池' && player.battery > 75) continue;   // 満タン近くは寄る意味がない
    var dx = sn.x-player.x, dz = sn.z-player.z;
    var d = Math.sqrt(dx*dx+dz*dz);
    if(d > 4.5 || d < 0.7) continue;
    var rel = botBearing(sn.x, sn.z);
    if(Math.abs(botNorm(rel - wantRel)) > 0.85) continue;     // 進路から大きく外れる
    // 気配や足音のする側にあるものへは寄らない（拾いに行って殴られる）
    var av = botAvoidSrc();
    if(av && Math.abs(botNorm(rel - av.rel)) < 0.9) continue;
    if(d < bd){ bd = d; best = rel; }
  }
  return best;
}

/* 逃げているときの曲がり方。
   直線で見えるいちばん先のマスを目標にしていたので、角に着いてから
   曲がる向きを決めていた。曲がるたび減速し、そこで詰められる。
   ひとつ先の区間の向きを見て、角の内側へ寄せた点を狙う（インを突く）。 */
function botFleeAim(/** @type {any} */ gx, /** @type {any} */ gy){
  var path = botPathList(gx, gy);
  if(!path || !path.length) return null;
  var ai = -1;
  for(var i=Math.min(path.length,12)-1; i>=0; i--){
    var w = cellToWorld(path[i].x, path[i].y);
    if(hasLOS(world.grid, player.x, player.z, w.x, w.z) &&
       !botPropInWay(player.x, player.z, w.x, w.z)){ ai = i; break; }
  }
  if(ai < 0) return cellToWorld(path[0].x, path[0].y);
  var aim = cellToWorld(path[ai].x, path[ai].y);
  // 角の先の向き。そちらへ内側を削るように寄せる
  var nx2 = path[Math.min(ai+2, path.length-1)];
  if(!nx2 || (nx2.x === path[ai].x && nx2.y === path[ai].y)) return aim;
  var nw = cellToWorld(nx2.x, nx2.y);
  var ox = nw.x - aim.x, oz = nw.z - aim.z;
  var ol = Math.sqrt(ox*ox + oz*oz) || 1;
  var cut = CELL * 0.42;
  var cx = aim.x + ox/ol*cut, cz = aim.z + oz/ol*cut;
  // 内側を削った結果が壁の中なら、素直に角を狙う
  if(!hasLOS(world.grid, player.x, player.z, cx, cz)) return aim;
  return { x:cx, z:cz };
}

function botPathAim(/** @type {any} */ gx, /** @type {any} */ gy){
  var path = botPathList(gx, gy);
  if(!path || !path.length) return null;
  var aim = null;
  for(var i=Math.min(path.length,10)-1; i>=0; i--){
    var w = cellToWorld(path[i].x, path[i].y);
    if(hasLOS(world.grid, player.x, player.z, w.x, w.z) &&
       !botPropInWay(player.x, player.z, w.x, w.z)){ aim = w; break; }
  }
  return aim || cellToWorld(path[0].x, path[0].y);
}
// 什器は壁ではないが、ぶつかれば止まる。直線化の判定には入れる
function botPropInWay(/** @type {any} */ x0, /** @type {any} */ z0, /** @type {any} */ x1, /** @type {any} */ z1){
  var dx = x1-x0, dz = z1-z0, len = Math.sqrt(dx*dx+dz*dz);
  if(len < 0.01) return false;
  var n = Math.min(20, Math.max(2, Math.ceil(len/0.5)));
  for(var i=1;i<=n;i++){
    var t = i/n, px = x0+dx*t, pz = z0+dz*t;
    for(var j=0;j<world.props.length;j++){
      var o = world.props[j];
      var ddx = px-o.x, ddz = pz-o.z, rr = o.r + 0.42;
      if(ddx*ddx + ddz*ddz < rr*rr) return true;
    }
  }
  return false;
}
/* ぶつかってから避けるのではなく、ぶつかる向きをそもそも入力しない。

   使える性質：進む向きは体の向きと分離できる。
     dirX = -sin(yaw)*f + cos(yaw)*s   （そのあと正規化）
   なので f = cos(rel), s = -sin(rel) で正面から rel だけずれた向きへ進める。
   正規化されるので斜めでも速度は落ちない。全力疾走の条件は f > 0.25 だけ
   なので、±45 度までは全力のまま横へ出られる。
   （「逃走中は横歩きすると遅くなる」という以前のコメントは速度に関して誤り） */
function botNearProps(){
  var out = [];
  for(var j=0;j<world.props.length;j++){
    var o = world.props[j];
    var dx = o.x-player.x, dz = o.z-player.z;
    if(dx*dx + dz*dz < 36) out.push(o);        // 6m 以内だけ見れば足りる
  }
  return out;
}
// 正面から rel だけずれた向きへ、体の幅で reach まで進めるか
function botDirOpen(/** @type {any} */ rel, /** @type {any} */ reach, /** @type {any} */ near){
  var a = player.yaw + rel;
  var fx = -Math.sin(a), fz = -Math.cos(a);
  var nx = -fz * (player.radius + 0.06), nz = fx * (player.radius + 0.06);
  for(var sd=-1; sd<=1; sd++){
    var x0 = player.x + nx*sd, z0 = player.z + nz*sd;
    if(!hasLOS(world.grid, x0, z0, x0 + fx*reach, z0 + fz*reach)) return false;
  }
  for(var j=0;j<near.length;j++){
    var o = near[j];
    var ox = o.x - player.x, oz = o.z - player.z;
    var rr = o.r + player.radius + 0.06;
    /* 既に什器の判定円に食い込んでいる場合。
       このとき線分の最近接距離はどの向きでも rr を下回るので、
       離れる向きまで「塞がっている」と答えてしまう。全方向が塞がると
       入力がゼロになり、その場に立ち尽くす（実測で逃走中の 27% がこれ）。
       食い込んでいるときは「近づく向きだけ」を弾く。 */
    if(ox*ox + oz*oz < rr*rr){
      if(ox*fx + oz*fz > 0) return false;
      continue;
    }
    var t = clamp(ox*fx + oz*fz, 0, reach);
    var cx = ox - fx*t, cz = oz - fz*t;
    if(cx*cx + cz*cz < rr*rr) return false;
  }
  return true;
}
/* 目的地からの歩数場。avoid=true なら危険地図の濃いマスを壁として扱う。 */
function botFlow(/** @type {any} */ gx, /** @type {any} */ gy, /** @type {any} */ lock, /** @type {any} */ avoid){
  var K = BOT.known, dist = new Int32Array(K.length).fill(-1);
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  var q = [gy*GW+gx]; dist[idx(gx,gy)] = 0;
  for(var h=0; h<q.length; h++){
    var c = q[h], cx = c%GW, cy = (c-cx)/GW;
    for(var i=0;i<4;i++){
      var nx = cx+DX[i], ny = cy+DY[i];
      if(nx<1||ny<1||nx>=GW-1||ny>=GH-1) continue;
      var k = idx(nx,ny);
      if(dist[k] >= 0 || K[k] === 2) continue;
      if(lock && nx===lock.x && ny===lock.y) continue;
      if(avoid && BOT.danger[k] >= 20) continue;
      dist[k] = dist[idx(cx,cy)] + 1;
      q.push(ny*GW+nx);
    }
  }
  return dist;
}
// 目的地までの経路をマスの並びで返す（先頭が次の一歩）
function botPathList(/** @type {any} */ gx, /** @type {any} */ gy){
  var st0 = worldToCell(player.x, player.z);
  st0.x = clamp(st0.x,1,GW-2); st0.y = clamp(st0.y,1,GH-2);
  gx = clamp(gx,1,GW-2); gy = clamp(gy,1,GH-2);
  if(st0.x===gx && st0.y===gy) return null;
  var lock = (world.lockDoor && !world.lockDoor.open) ? world.lockDoor.cell : null;
  /* 気配のした辺りを通らない経路を先に探す。危険地図はこれまで書くだけで
     一度も読まれておらず、探索の経路が相手の目の前を横切っていた。
     迂回できないときだけ、危険を無視した経路に落とす（閉じ込め防止）。 */
  var dist = botFlow(gx, gy, lock, true);
  if(dist[idx(st0.x,st0.y)] < 0) dist = botFlow(gx, gy, lock, false);
  var here = dist[idx(st0.x,st0.y)];
  if(here < 0) return null;
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  var out = [], cur = st0, guard = 0;
  while(here > 0 && guard++ < 200){
    var found = null;
    for(var j=0;j<4;j++){
      var ax = cur.x+DX[j], ay = cur.y+DY[j];
      if(!inBounds(ax,ay)) continue;
      if(dist[idx(ax,ay)] === here-1){ found = {x:ax,y:ay}; break; }
    }
    if(!found) break;
    out.push(found); cur = found; here--;
  }
  return out;
}

function botPathNext(/** @type {any} */ gx, /** @type {any} */ gy){
  var s = worldToCell(player.x, player.z);
  s.x = clamp(s.x,1,GW-2); s.y = clamp(s.y,1,GH-2);
  gx = clamp(gx,1,GW-2); gy = clamp(gy,1,GH-2);
  if(s.x===gx && s.y===gy) return null;
  var lock = (world.lockDoor && !world.lockDoor.open) ? world.lockDoor.cell : null;
  var dist = botFlow(gx, gy, lock, true);
  if(dist[idx(s.x,s.y)] < 0) dist = botFlow(gx, gy, lock, false);
  var here = dist[idx(s.x,s.y)];
  if(here < 0) return null;
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  for(var j=0;j<4;j++){
    var ax = s.x+DX[j], ay = s.y+DY[j];
    if(!inBounds(ax,ay)) continue;
    if(dist[idx(ax,ay)] === here-1) return { x:ax, y:ay, len:here };
  }
  return null;
}

/* 未探索の境界へ向かう。一度決めた行き先は着くまで変えない。
   毎フレーム選び直すと近い境界のあいだを往復して前に進まない。
   距離は直線ではなく記憶地図の上の歩数で測る（すぐ隣に見えて実は
   大回りが要る境界に引っ張られないため）。 */
/* 危険の記憶。気配のした辺りを覚えておく。
   探索先の選定で避けさせてみたが、遠回りが増えて exposure が伸び、
   生存時間の中央値が 125→80 秒に縮んだので判断には使っていない。
   （相手は歩き回るので、古い位置情報の価値が低いのだと思う） */
function botMarkDanger(/** @type {number} */ dt, /** @type {any} */ th, /** @type {any} */ hpos){
  BOT.dangerT -= dt;
  if(BOT.dangerT <= 0){                       // 0.5 秒ごとに全体を薄める
    for(var i=0;i<BOT.danger.length;i++) if(BOT.danger[i] > 0) BOT.danger[i] -= 1;
    BOT.dangerT = 0.5;
  }
  if(th < 0.08 || !hpos) return;
  var c = worldToCell(hpos.x, hpos.z);
  var amt = Math.round(th*40);
  for(var dy=-2; dy<=2; dy++) for(var dx=-2; dx<=2; dx++){
    var x = c.x+dx, y = c.y+dy;
    if(!inBounds(x,y)) continue;
    var k = idx(x,y);
    BOT.danger[k] = Math.min(60, BOT.danger[k] + amt/(1+Math.abs(dx)+Math.abs(dy)));
  }
}

function botPickExplore(){
  var K = BOT.known;
  var s = worldToCell(player.x, player.z);
  s.x = clamp(s.x,1,GW-2); s.y = clamp(s.y,1,GH-2);
  var dist = new Int32Array(K.length).fill(-1);
  var q = [s.y*GW+s.x]; dist[idx(s.x,s.y)] = 0;
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  for(var h=0; h<q.length; h++){
    var c = q[h], cx = c%GW, cy = (c-cx)/GW;
    for(var i=0;i<4;i++){
      var nx = cx+DX[i], ny = cy+DY[i];
      if(nx<1||ny<1||nx>=GW-1||ny>=GH-1) continue;
      var k = idx(nx,ny);
      if(dist[k] >= 0 || K[k] === 2) continue;
      dist[k] = dist[idx(cx,cy)] + 1;
      q.push(ny*GW+nx);
    }
  }
  /* 非常口をまだ知らない終盤は、いちばん近い境界ではなく
     「入ってきた場所から遠い境界」を優先する。
     非常口は起点からの歩数が最大のマスに置かれる（世界生成の規則）ので、
     人が「入口から遠いほうへ行けば出口がある」と考えるのと同じ推測。
     実測：3/4 に着いた時点で地図の 69% は踏破済みなのに、非常口が
     見つかるのは中央値 266 秒。クリアした回は 214 秒、落とした回は 315 秒で、
     ここが勝敗のいちばん強い予測子だった。 */
  var farSeek = BOT.seekExit && BOT.startCell;
  var sdist = null;
  if(farSeek){
    sdist = new Int32Array(K.length).fill(-1);
    var q2 = [BOT.startCell.y*GW + BOT.startCell.x];
    sdist[idx(BOT.startCell.x, BOT.startCell.y)] = 0;
    for(var h2=0; h2<q2.length; h2++){
      var c2 = q2[h2], cx2 = c2%GW, cy2 = (c2-cx2)/GW;
      for(var i2=0;i2<4;i2++){
        var nx2 = cx2+DX[i2], ny2 = cy2+DY[i2];
        if(nx2<1||ny2<1||nx2>=GW-1||ny2>=GH-1) continue;
        var k2 = idx(nx2,ny2);
        if(sdist[k2] >= 0 || K[k2] === 2) continue;
        sdist[k2] = sdist[idx(cx2,cy2)] + 1;
        q2.push(ny2*GW+nx2);
      }
    }
  }
  var best = null, bs = 1e9;
  for(var y=1;y<GH-1;y++) for(var x=1;x<GW-1;x++){
    if(K[idx(x,y)] !== 1) continue;
    if(K[idx(x+1,y)] && K[idx(x-1,y)] && K[idx(x,y+1)] && K[idx(x,y-1)]) continue;
    var d = dist[idx(x,y)];
    if(d < 0) continue;
    var sc = d + BOT.penalty[idx(x,y)];
    if(farSeek){
      var sd2 = sdist[idx(x,y)];
      if(sd2 >= 0) sc = d*0.55 + BOT.penalty[idx(x,y)] - sd2*1.2;
    }
    if(sc < bs){ bs = sc; best = {x:x, y:y}; }
  }
  return best;
}
function botFrontier(){
  var t = BOT.exploreTgt, K = BOT.known;
  if(t){
    var w = cellToWorld(t.x, t.y);
    var reached = Math.sqrt((w.x-player.x)*(w.x-player.x)+(w.z-player.z)*(w.z-player.z)) < CELL*0.9;
    var stale = K[idx(t.x,t.y)] !== 1 ||
      (K[idx(t.x+1,t.y)] && K[idx(t.x-1,t.y)] && K[idx(t.x,t.y+1)] && K[idx(t.x,t.y-1)]);
    if(!reached && !stale) return t;
    if(reached) BOT.penalty[idx(t.x,t.y)] += 4;
  }
  BOT.exploreTgt = botPickExplore();
  return BOT.exploreTgt;
}

function botNearest(/** @type {any} */ kind){
  var best = null, bd = 1e9;
  for(var i=0;i<BOT.seen.length;i++){
    var it = BOT.seen[i];
    if(it.kind !== kind) continue;
    if(it.ref && it.ref.taken) continue;
    if(kind === '施錠扉' && it.ref && it.ref.open) continue;
    var d = Math.sqrt((it.x-player.x)*(it.x-player.x)+(it.z-player.z)*(it.z-player.z));
    if(d < bd){ bd = d; best = it; }
  }
  return best;
}

function botChooseGoal(){
  var t;
  // 切れてからでは遅い。ランプが無いと追跡者より遅くなる
  /* 電池切れが被弾の 33% を占める。見つけたら満タンでない限り拾っておく */
  /* 電池は 1 個で満タンまで戻る。つまり拾った瞬間に残っていた量が、
     そのまま捨てた量になる。数は難易度で 4〜6 個しかない。
     ランプの消費は静穏 1.05/s・通常 1.5/s なので、満タンは 95 秒／67 秒ぶん。
     早く拾うほど損なので、減ってから拾う。場所は BOT.seen が覚えているので
     急ぐ必要はない。例外として目の前（4m 以内）なら少し早くても拾う。 */
  /* もう要らない電池を拾いに寄り道しない。
     残りの道のりで使うぶんが残っていれば、それ以上は死ぬまで使い切れない。
     終盤（カルテを全部集めた後）は居場所が漏れ続けるので、寄り道は
     そのまま被弾に化ける。必要量は「非常口までの距離 ÷ 4.5 m/s × 1.05/s」に
     2 倍の余裕を見て出す（迷って往復するぶん）。 */
  var battNeed = 1e9;
  if(world.exit){
    var exT = botNearest('非常口');
    if(exT){
      var exD = Math.sqrt((exT.x-player.x)*(exT.x-player.x) + (exT.z-player.z)*(exT.z-player.z));
      var legs = (player.got >= player.need) ? 1 : 3;   // まだ集める途中なら往復ぶん見る
      battNeed = (exD * legs / 4.5) * 1.05 * 2.0;
    }
  }
  if(player.battery < battNeed && (t = botNearest('電池'))){
    var bdd = Math.sqrt((t.x-player.x)*(t.x-player.x) + (t.z-player.z)*(t.z-player.z));
    if(player.battery <= 55 || (bdd < 4 && player.battery <= 75))
      return { kind:'電池', x:t.x, z:t.z, obj:t.ref };
  }
  /* 鍵は見つけ次第その場で取る。
     以前は「全部集めて非常口が開いてから」しか鍵を目標にしていなかったので、
     途中で見かけた鍵を素通りして、あとで取りに戻っていた。実測で 4枚目 258s /
     鍵 354s / 死亡 380s と、戻っているあいだに死んでいる。しかも全部集めた後は
     隠れても居場所を嗅ぎつけられる（endgame）ので、隠れが効かない時間帯に
     いちばん遠出することになっていた。 */
  if(!player.hasKey && (t = botNearest('鍵'))) return { kind:'鍵', x:t.x, z:t.z, obj:t.ref };
  if(!world.exit.open){
    /* 最後の 1 枚を取ると非常口が開くが、同時に居場所が漏れ続ける状態になり、
       隠れが効かなくなる。実測ではその瞬間、非常口までの距離が中央値 87〜99m
       あるのに場所を知っているのは 38% しかなく、負けの 59% がこの
       「最後の移動」で起きていた。出口の在り処が分かるまで最後の 1 枚は残す。
       ※これは「全部集めると追われ方が変わる」を知っている前提の動き。
         見つからないまま時間を溶かさないよう締切を切る。 */
    /* 最後の 1 枚を取った瞬間から、隠れが効かない状態で出口まで走ることになる。
       行き先が分かっていて、かつ静かなときを選ぶ（実測 0.05 は約 15m 以遠）。 */
    var lastReady = botNearest('非常口') && player.hasKey && botThreat() < 0.05 &&
                    BOT.fleeT <= 0 && !player.hiding;
    if(player.got === player.need - 1 && player.time < 900 &&
       !lastReady && (t = botNearest('カルテ'))){
      BOT.seekExit = true;
      /* 待ち方が二種類ある。
         非常口も鍵もまだ知らないなら、探すしかない（探索）。
         両方すでに知っていて「静かになるのを待つだけ」なら、探索に出る
         理由がない。歩き回れば足音で見つかるだけなので、最後の 1 枚の
         近くの隠れ場所へ寄って待つ。
         実測：負け 125 本のうち 65 本（52%）がこの「カルテ 3/4」の局面で
         起きていた。 */
      if(botNearest('非常口') && player.hasKey){
        var wsp = null, wbest = 1e9;
        for(var wi=0; wi<BOT.seen.length; wi++){
          var ws = BOT.seen[wi];
          if(ws.kind !== '隠れ場所') continue;
          var wd = Math.sqrt((ws.x-t.x)*(ws.x-t.x) + (ws.z-t.z)*(ws.z-t.z));
          if(wd < wbest && wd < 16){ wbest = wd; wsp = ws; }
        }
        if(wsp) return { kind:'待機', x:wsp.x, z:wsp.z, obj:wsp.ref };
      }
      return { kind:'探索', x:null, z:null };
    }
    BOT.seekExit = false;
    /* どのカルテを先に取るか。最後の 1 枚を取った瞬間から居場所が漏れ続けるので、
       そこから非常口までの距離が短いほどよい。非常口の場所が分かっていて
       候補が複数あるなら、非常口から遠い方を先に片付け、近い方を残す。
       自分からの距離も見ないと地図を横断しに行くので、両方を重みで混ぜる。 */
    var ex2 = botNearest('非常口');
    if(ex2){
      var pick2 = null, pb2 = -1e9;
      for(var ri=0; ri<BOT.seen.length; ri++){
        var rs = BOT.seen[ri];
        if(rs.kind !== 'カルテ' || (rs.ref && rs.ref.taken)) continue;
        var dme = Math.sqrt((rs.x-player.x)*(rs.x-player.x) + (rs.z-player.z)*(rs.z-player.z));
        var dex = Math.sqrt((rs.x-ex2.x)*(rs.x-ex2.x) + (rs.z-ex2.z)*(rs.z-ex2.z));
        var sc2 = dex - dme*0.8;
        if(sc2 > pb2){ pb2 = sc2; pick2 = rs; }
      }
      if(pick2) return { kind:'カルテ', x:pick2.x, z:pick2.z, obj:pick2.ref };
    }
    if((t = botNearest('カルテ'))) return { kind:'カルテ', x:t.x, z:t.z, obj:t.ref };
    return { kind:'探索', x:null, z:null };
  }
  if(world.lockDoor && !world.lockDoor.open && !player.hasKey){
    if((t = botNearest('鍵'))) return { kind:'鍵', x:t.x, z:t.z, obj:t.ref };
    return { kind:'探索', x:null, z:null };
  }
  if(world.lockDoor && !world.lockDoor.open && player.hasKey){
    /* 扉の板はマスの境界にあり、その座標は 30% の確率で「非常口のマス」側へ
       丸まる。そのマスは経路探索が除外しているので、目標にすると経路が
       引けず、扉の前まで行けないまま終わっていた。
       開けに行く側のマスの中心を目標にする。 */
    if((t = botNearest('施錠扉'))){
      var pc2 = world.lockDoor.preCell;
      if(pc2){
        var pw2 = cellToWorld(pc2.x, pc2.y);
        return { kind:'施錠扉', x:pw2.x, z:pw2.z, obj:t.ref };
      }
      return { kind:'施錠扉', x:t.x, z:t.z, obj:t.ref };
    }
  }
  /* 停電の章は、電源を戻すまで非常口が開かない。戻すと大きな音で居場所が
     漏れるので、出口の場所が分かってから戻しに行く（知らないうちに戻すと
     呼び寄せたまま探し回ることになる） */
  if(world.blackout && !world.power){
    if(botNearest('非常口') && (t = botNearest('電源'))) return { kind:'電源', x:t.x, z:t.z, obj:t.ref };
    if((t = botNearest('電源')) && !botNearest('非常口')) return { kind:'探索', x:null, z:null };
    if(!botNearest('電源')) return { kind:'探索', x:null, z:null };
  }
  if((t = botNearest('非常口'))) return { kind:'非常口', x:t.x, z:t.z, obj:t.ref };
  if(BOT.signHint && (player.time - BOT.signHint.t) < 25){
    /* 板そのものは目的地ではない。「そっちだ」と分かれば役目は終わり。
       近くまで来たら使い切ったことにして、探索に戻す。 */
    var sgd = Math.sqrt((BOT.signHint.x-player.x)*(BOT.signHint.x-player.x) +
                        (BOT.signHint.z-player.z)*(BOT.signHint.z-player.z));
    if(sgd < 4.5){
      BOT.signUsed[BOT.signHint.key] = 1;
      BOT.signHint = null;
    }else{
      return { kind:'誘導灯', x:BOT.signHint.x, z:BOT.signHint.z };
    }
  }
  return { kind:'探索', x:null, z:null };
}

/* 逃げ道。まっすぐ長い廊下は相手からもずっと見えているので、走力差が
   6%しかないこのゲームでは振り切れない。人は角を曲がって姿を消す。
   音と見た向きから相手のいるあたりを推定し、その位置から見えなくなる
   場所へ出られる道を高く評価する。 */
/* 追跡者の居場所の見当。
   音の定位は前後を区別できないので、これだけを毎フレーム信じると
   角を曲がった直後に「音のする方＝正面」と誤解して引き返してしまう
   （実際それで、開いた 5m を自分から詰めて殴られていた）。

   人は「さっきそこにいた、追ってきているから今はこの辺」と考える。
   見えたらその位置を起点に置き、見えていない間は追跡者の足の速さぶん
   こちらへ寄せていく。音は「まだ近い / もう聞こえない」の確認に使う。 */
/* 足音の大きさを距離に戻す。Audio2 の減衰 (6/(6+d))·(1-(d/40)³) の逆関数。
   壁越しは 0.55 倍で鳴るが、そのときは低い音だけが届いてこもって聞こえる
   ので、遮蔽の有無は音色で分かる（stepHot）。先に割り戻してから解く。
   人が「音量と音色で距離を測る」のと同じことを、二分法でやっているだけ。 */
function botStepDist(/** @type {any} */ att, /** @type {any} */ hot){
  var a = att / (hot ? 1 : 0.55);
  if(a <= 0.0002) return 40;
  var lo = 0, hi = 40;
  for(var i=0;i<22;i++){
    var m = (lo+hi)*0.5;
    var v = (6/(6+m)) * (1 - Math.pow(m/40,3));
    if(v > a) lo = m; else hi = m;
  }
  return (lo+hi)*0.5;
}
/* 足音のたびに「相手はこのへん」を置き直す。
   足音は 1.5m 歩くごとに 40m まで鳴っており、徘徊中でも音量が落ちない
   （立体音響の vol は mode で 0.42 倍されるが、足音はされない）。
   つまりこれが唯一の遠距離警報で、これまで向きしか使っていなかった。 */
function botBelief(/** @type {number} */ dt){
  BOT.belAge += dt;
  if(BOT.ear.stepT <= BOT.belT) return;
  BOT.belT = BOT.ear.stepT;
  var d = botStepDist(BOT.ear.stepAtt, BOT.ear.stepHot);
  // 距離の聞き分けは正確ではない。壁越しはさらに鈍る
  d *= 1 + (botRnd()*2 - 1) * (BOT.ear.stepHot ? 0.16 : 0.30);
  var a = BOT.ear.stepWorld + (botRnd()*2 - 1) * (0.10 + d*0.012) * (BOT.ear.stepHot ? 1 : 2);
  BOT.bel = { x: player.x - Math.sin(a)*d, z: player.z - Math.cos(a)*d };
  BOT.belD = d; BOT.belAge = 0;
}
/* いま相手はどれくらい近いか。見えていればその距離、
   足音が新しければその距離、どちらも無ければ「遠い」。
   時間が経つほど当てにならないので、経過ぶん近い側に見積もる
   （外すなら「思ったより近い」側に外すほうが安全）。 */
function botHunterDist(){
  if(hunter.group && hunter.group.visible){
    var hb = botBearing(hunter.x, hunter.z);
    var hdd = Math.sqrt((hunter.x-player.x)*(hunter.x-player.x)+(hunter.z-player.z)*(hunter.z-player.z));
    if(hdd < botEyeRange() && Math.abs(hb) < 1.08 &&
       hasSight(world.grid, player.x, player.z, hunter.x, hunter.z)) return hdd;
  }
  if(BOT.belAge > 4.0) return 99;
  return Math.max(1.5, BOT.belD - BOT.belAge * 4.48);
}

function botTrackHunter(/** @type {number} */ dt, /** @type {any} */ sawHunter){
  botBelief(dt);
  // 自分の足跡を残す。追跡者は経路を辿って追ってくるので、
  // 見えていないときの「相手のいるあたり」は自分が通ってきた道の上にある。
  BOT.trailT -= dt;
  if(BOT.trailT <= 0){
    BOT.trail.push({ x:player.x, z:player.z });
    if(BOT.trail.length > 60) BOT.trail.shift();
    BOT.trailT = 0.25;
  }
  if(sawHunter){ BOT.hpos = { x:hunter.x, z:hunter.z }; BOT.hposFresh = 0; return; }
  BOT.hposFresh += dt;
  /* 足音から立てた見当（BOT.bel）をそのまま BOT.hpos に流し込んでみたが、
     60 試行で 18.3% → 11.7% と落ちた。推定はむしろ正確になっている
     （0〜24m で誤差の中央値 0.2m）のに悪くなるのは、hpos が非 null に
     なる時間が 2 倍になり、寄り道の抑制・進路の回避・危険地図といった
     「hpos があるときだけ働く」仕掛けが遠すぎる相手にまで反応したから。
     見当は距離の判断（botHunterDist）だけに使い、hpos の意味は変えない。 */
  if(botThreat() < 0.04){ BOT.hpos = null; return; }   // もう聞こえない＝見当を捨てる
  /* 見てから時間が経ったら置き直す。まず耳で。
     聴覚が前後を持つようになったので、方位は正確・距離は気配の強さ相当で
     出せる。逃走先の選定も危険地図もこの点を基準にしているので、ここが
     ずれていると「相手の方へ逃げる」が起きる（実測で逃走開始の 46%）。 */
  var thT = botThreat();
  if(BOT.hposFresh > 0.35 && thT > 0.05){
    BOT.hpos = botEstHunter(botHearRel(), thT);
    return;
  }
  // 音も無いときだけ、自分の足跡をさかのぼった点を当て推量に使う。
  // プレイヤー自身に収束させると、どの向きも同じに見えて逃げ先が決まらない
  if(BOT.hposFresh > 0.5){
    var want = 5.0;                       // これくらい後ろ
    var acc = 0, prev = { x:player.x, z:player.z }, spot = null;
    for(var i=BOT.trail.length-1; i>=0; i--){
      var t = BOT.trail[i];
      acc += Math.sqrt((t.x-prev.x)*(t.x-prev.x) + (t.z-prev.z)*(t.z-prev.z));
      prev = t;
      if(acc >= want){ spot = t; break; }
    }
    if(spot) BOT.hpos = { x:spot.x, z:spot.z };
  }
}

/* 気配の大きさから距離を出す。
   以前は d = 3.5 + (1-th)*18 という直線で、th=0.355（実測 3.2m）を
   15.1m と答えていた。いちばん危ない近距離で推定が最も外れており、
   逃走先も危険地図もその外れ値の上に作られていた。
   実測の対応（hunt 中）:
     3.2m→0.355  6m→0.092  9m→0.072  13m→0.048  18m→0.025
   これに合う減衰曲線に置き換える（4.3 / 9.5 / 14 / 20m と答える）。 */
function botEstHunter(/** @type {any} */ rel, /** @type {any} */ th){
  var d = clamp(2.2 / Math.pow(Math.max(th, 0.012), 0.6), 2.0, 26);
  var a = player.yaw + rel;
  return { x: player.x - Math.sin(a)*d, z: player.z - Math.cos(a)*d };
}
/* 逃げ先を「向き」ではなく「行き先」で決める。
   レイで選ぶと 10〜20m 先の壁で必ず行き止まり、そこで減速して追いつかれる。
   相手の推定位置から歩数場を作り、記憶地図の上で
   「相手から遠く、自分からは近い」マスへ経路を引く。 */
/* 聴覚の実装：hearOpen = hearing × noise、noise は 走行1.6 / 歩行1.0 / 静止0.45、
   壁越しはその 0.55 倍。走ると壁越し 8.8m まで足音が届き、heard が立つあいだ
   hunter.lastSeen は現在地で更新され続ける。だから視線を切っても走り続ける
   かぎり追跡は切れない。
   そこで「視線が切れたら歩きに落として足音を殺す」を試したが、32 試行で
   クリア 1（同時期の基準 21%）。追跡者の記憶は 1.8 秒あり、その間は完全追尾の
   ままなので、歩くと 1 m/s ずつ詰められて負ける。
   同じ穴を突くなら隠れる方（隠れていると heard は 3.2m 以内でしか立たない）。
   「推定位置から視線が通らないマス」への加点も 32 試行でクリア 4（12%）で、
   基準を超えなかった。推定位置が外れているときに相手側へ寄ってしまう。 */
/* --- 効かなかった案（絶望・240 試行ずつ実測）-------------------------------
   同じ穴を掘り直さないために残す。基準は クリア 19.2% / 被弾 0.45(100秒)。

   ・追跡中の逃げ先に「相手から見通せないマス」へ加点（+14）… 変化なし。
     絶望では逃走の行き先が先に箱で決まるので、そもそも通らない枝だった。
   ・逃げ先の重み替え（前進加点 7→3、相手からの距離 1.0→2.5、
     自分からの距離 0.25→0.60）… 11.3〜12.5%。どれも誤差。
   ・逃走中だけ横歩きを強く嫌う … 追跡中の実速度は 4.94→5.13 に上がるが、
     離れる成分は 3.77→3.73 で変わらず。通常難易度が 37.5%→23.3% に悪化。
   ・探索中も横歩きを嫌う＋首の回転を速く … 壁をこする時間が 3.0%→8.0%、6.7%。
   ・相手が 26m 以内なら歩いて足音を殺す … 11.7%、被弾は変わらず。
     聞かれること自体は死因ではない（音で来られても速度で振り切れる）。
   ・足音で測った距離（誤差 中央値 0.2m）を BOT.hpos に流す … 11.7%。
     hpos が非 null の時間が 2 倍になり、寄り道の抑制や進路の回避が
     遠すぎる相手にまで反応した。距離は距離として別に持つのが正しい。
   ・25m 手前から隠れに行く … 13.3%。走破が 410→450 秒に伸びて相殺。
   ・「間に合う箱」の条件を外して 22m から隠れに行く … 7.9%。
   ・入らずに箱の脇で待つ … 5.8%、被弾 0.85 に悪化。止まって待つのは
     こちらから見つけに行くのと同じだった。
   ・見通せる位置にいるあいだ数メートル横へずれて線を切る … 14.2%。
   ・相手が 24m より遠いときは進路を曲げない … 被弾 0.76→0.97 に悪化。
     遠いうちから相手の側へ行かないことが、出会いそのものを減らしていた。
   ・相手が正面 41 度以内かつ 33m 以内ならランプを消す … 12.5%。
     消すと 0.86 倍になる代償のほうが大きい。
   ・ロッカーを暗くても 12m から覚える（既知 11/25 箇所の改善）… 変化なし。
   ・逃走を箱優先にしない … 17.1%。誤差。
   -------------------------------------------------------------------------- */
/* 記憶した地図の上での視線判定。
   世界の grid をそのまま読むと「まだ見ていない壁」まで使えてしまう。
   知らないマスは通り抜けられる（＝見通せる）ものとして扱う——見えると
   思って外すぶんには安全側に倒れる。 */
function botLOSKnown(/** @type {any} */ x0, /** @type {any} */ z0, /** @type {any} */ x1, /** @type {any} */ z1){
  var K = BOT.known;
  var dx = x1-x0, dz = z1-z0;
  var dist = Math.sqrt(dx*dx+dz*dz);
  if(dist < 0.001) return true;
  var steps = Math.ceil(dist / (CELL*0.28));
  for(var i=1;i<steps;i++){
    var t = i/steps;
    var c = worldToCell(x0+dx*t, z0+dz*t);
    if(!inBounds(c.x,c.y)) return false;
    if(K[idx(c.x,c.y)] === 2) return false;
  }
  return true;
}

function botFleeStep(/** @type {any} */ hpos){
  var K = BOT.known;
  var hc = worldToCell(hpos.x, hpos.z);
  hc.x = clamp(hc.x,1,GW-2); hc.y = clamp(hc.y,1,GH-2);
  var s0 = worldToCell(player.x, player.z);
  s0.x = clamp(s0.x,1,GW-2); s0.y = clamp(s0.y,1,GH-2);
  var DX=[1,-1,0,0], DY=[0,0,1,-1];
  function field(/** @type {any} */ sx, /** @type {any} */ sy){
    var d = new Int32Array(K.length).fill(-1);
    var q = [sy*GW+sx]; d[idx(sx,sy)] = 0;
    for(var h=0; h<q.length; h++){
      var c = q[h], cx = c%GW, cy = (c-cx)/GW;
      for(var i=0;i<4;i++){
        var nx = cx+DX[i], ny = cy+DY[i];
        if(nx<1||ny<1||nx>=GW-1||ny>=GH-1) continue;
        var k = idx(nx,ny);
        if(d[k] >= 0 || K[k] === 2) continue;
        d[k] = d[idx(cx,cy)] + 1;
        q.push(ny*GW+nx);
      }
    }
    return d;
  }
  var hf = field(hc.x, hc.y), pf = field(s0.x, s0.y);
  /* 行き先は遠くに取る。近い点を 0.5 秒ごとに選び直すと、そのたび向きが
     変わって曲がり、曲がるたびに失速して詰められる。実測では直線で走って
     いる間は 2.7m→5.1m と離せていたのに、曲がった直後に一気に詰められていた。
     いま走っている向きを続けられる行き先を優遇して、なるべく曲がらない。 */
  var fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
  /* 相手のいる側を向いたまま逃げ出すと、ahead*7（いまの向きを続ける加点）が
     そのまま「相手の方へ走る」加点になっていた。実機で「逃げる向きに敵を
     選ぶことがある」と指摘された挙動。相手の方位に近いマスは候補から外す。
     全部落ちたら制限を緩めて選び直す（行き止まりで固まらないため）。 */
  /* 終盤（カルテを全部集めた後）は、逃げるだけでは何も終わらない。
     居場所は漏れ続けるので隠れても追跡は切れず、時間だけが減る。
     出口の場所を知っているなら、逃げ先も出口に近い方を選ぶ。
     ただし寄せすぎると、決まった一点へ走るぶん回り込まれる。弱めに効かせる。 */
  var ef = null;
  if(world.endgame){
    var exT2 = botNearest('非常口');
    if(exT2){
      var exC = worldToCell(exT2.x, exT2.z);
      ef = field(clamp(exC.x,1,GW-2), clamp(exC.y,1,GH-2));
    }
  }
  var hbx = hpos.x - player.x, hbz = hpos.z - player.z;
  var hbl = Math.sqrt(hbx*hbx + hbz*hbz) || 1;
  hbx /= hbl; hbz /= hbl;
  var best = null, bs = -1e9;
  for(var pass2=0; pass2<2 && !best; pass2++){
    var lim2 = pass2 === 0 ? 0.35 : 0.72;       // 70 度以内 → 44 度以内を除外
    bs = -1e9;
    for(var y=1;y<GH-1;y++) for(var x=1;x<GW-1;x++){
      var k2 = idx(x,y);
      if(K[k2] === 2) continue;
      var dp = pf[k2]; if(dp < 0 || dp < 3 || dp > 26) continue;   // 遠すぎず近すぎず
      var dh = hf[k2]; if(dh < 0) dh = 45;          // 相手から辿れない＝安全
      var w2 = cellToWorld(x,y);
      var vx = w2.x - player.x, vz = w2.z - player.z;
      var vl = Math.sqrt(vx*vx+vz*vz) || 1;
      var toH = (vx/vl)*hbx + (vz/vl)*hbz;          // 相手の方位との一致
      if(toH > lim2) continue;
      var ahead = (vx/vl)*fx + (vz/vl)*fz;          // いまの向きとの一致（-1..1）
      /* 追いつかれない場所を選ぶ。
         いままでは「相手から遠く、自分からは近い」を dh - dp*0.25 で
         測っていたが、係数 0.25 は自分の移動をほぼ無料と見なしていた。
         正しい尺度は到達時間の差で、相手 6.33 m/s・こちらの持続 5.23 m/s
         なら自分の 1 歩は相手の 1.21 歩に相当する。 */
      var sc = dh*1.0 - dp*1.21 + ahead*7 - Math.max(0, toH)*12;
      /* 視線を切ることに点を出す。
         逃走の要はここだった。追跡の速度は 5.72＋怒り 0.61＝6.33 で
         全力疾走 5.755 より速いが、視線が切れて記憶（3.2 秒）が尽きると
         mode が hunt に落ち、速度は 4.270×1.05＝4.48 まで下がる。
         そこで初めてこちらが 1.27 m/s 速くなり、離れられる。
         実測（絶望・32 本）では追跡中の 77.5% で視線が通っており、
         切れても中央値 0.7 秒・最長 2.2 秒で、3.2 秒に一度も届いていなかった。
         距離だけを見て逃げ先を選んでいたのが原因で、角を曲がる動機が
         どこにも無かった。
         いまの自分の位置からも見えない場所を選べば「角を曲がる」になる
         （相手はこちらの現在地へ真っ直ぐ来るので、その視点で隠れる）。 */
      if(!botLOSKnown(hpos.x, hpos.z, w2.x, w2.z)) sc += 14;
      if(!botLOSKnown(player.x, player.z, w2.x, w2.z)) sc += 8;
      if(ef){ var de = ef[k2]; if(de >= 0) sc += (55 - Math.min(de, 55)) * 0.30; }
      if(sc > bs){ bs = sc; best = {x:x, y:y}; }
    }
  }
  if(!best) return null;
  BOT.escGoal = best;
  return botPathNext(best.x, best.y);
}

function botPickEscape(/** @type {any} */ awayRel, /** @type {any} */ hpos){
  var best = awayRel, bs = -1e9;
  for(var i=-6;i<=6;i++){
    var rel = awayRel + i*0.314;
    var a = player.yaw + rel;
    var fx = -Math.sin(a), fz = -Math.cos(a);
    var open = 0;
    for(var d=0.5; d<22; d+=0.5){
      var c = worldToCell(player.x+fx*d, player.z+fz*d);
      if(!inBounds(c.x,c.y) || world.grid[idx(c.x,c.y)] !== 0) break;
      open = d;
    }
    if(open < 2.5) continue;
    var sc = Math.min(open,12)*0.6 - Math.abs(((rel-awayRel+Math.PI*3)%TAU)-Math.PI)*4;
    if(hpos){
      // 相手の方位から 60 度以内へは走り出さない
      var ehl = Math.sqrt((hpos.x-player.x)*(hpos.x-player.x)+(hpos.z-player.z)*(hpos.z-player.z)) || 1;
      if(fx*(hpos.x-player.x)/ehl + fz*(hpos.z-player.z)/ehl > 0.5) continue;
      if(open >= 5 && !hasLOS(world.grid, player.x+fx*5, player.z+fz*5, hpos.x, hpos.z)) sc += 9;
      if(open >= 9 && !hasLOS(world.grid, player.x+fx*9, player.z+fz*9, hpos.x, hpos.z)) sc += 9;
    }
    if(sc > bs){ bs = sc; best = rel; }
  }
  return best;
}

// 視点。瞬間移動させず、加速と最高角速度と手ぶれを通す
/* 視点の上下。人は拾うものを見下ろし、隠れるときは箱の中を見て、
   歩いているあいだも視線が水平で固まったりはしない。
   ゲーム側の判定（追跡者の視認・ランプの向き）は viewYaw しか見ていないので、
   上下は見た目と気配の演出にだけ効く。 */
function botLookHeight(/** @type {any} */ kind){
  if(kind === 'カルテ') return 0.90;
  if(kind === '電池')   return 0.62;
  if(kind === '鍵')     return 0.85;
  if(kind === '施錠扉') return 1.30;
  if(kind === '非常口') return 1.45;
  if(kind === '隠れ場所' || kind === '待機') return 1.25;
  return 1.55;
}
function botPitchTarget(/** @type {any} */ fleeing){
  // 隠れている間は、箱の隙間から外をうかがう程度に落ち着く
  if(player.hiding){
    // ベッドや机の下は目線が低い（camY 0.4 前後）。上を向いて外をうかがう
    var low = player.hiding.camY < 0.8;
    return low ? (0.10 + BOT.idlePitch * 0.3) : (BOT.idlePitch * 0.5 - 0.06);
  }
  // 逃げている間は行き先を見る。足元を見ている場合ではない
  if(fleeing) return clamp(BOT.idlePitch * 0.25, -0.10, 0.10);
  var g = BOT.goal;
  if(g && g.x !== null){
    var dx2 = g.x - player.x, dz2 = g.z - player.z;
    var d2 = Math.sqrt(dx2*dx2 + dz2*dz2);
    if(d2 < 6.0){
      // 近づくほど深く見下ろす。拾う瞬間はほぼ真下を向く
      var h = botLookHeight(g.kind);
      return clamp(Math.atan2(h - player.y, Math.max(0.45, d2)), -1.0, 0.35);
    }
  }
  return BOT.idlePitch;
}
function botSteer(/** @type {any} */ wantRel, /** @type {number} */ dt, /** @type {any} */ vmax){
  BOT.noiseT -= dt;
  if(BOT.noiseT <= 0){ BOT.noiseT = 0.25 + botRnd()*0.4; BOT.noise = (botRnd()-0.5)*0.045; }
  /* 人の首は一定速度では回らない。「速く振る → 止めて確かめる」の繰り返しで、
     止まっているあいだも完全には静止しない。
     ここまでは誤差へ比例した速度で滑らかに追い続けていて、それが
     いちばん機械に見えるところだった。

     ・大きくずれたときは勢いよく振り出す（利得を上げる）
     ・目標に乗ったら 0.1〜0.3 秒だけ止めて確かめる（固視）
     ・止まっているあいだも、周期の違う 2 つの波で細かく震える

     逃げている最中は固視を入れない（振り向きが遅れると殴られる）。 */
  BOT.tremT += dt;
  var trem = Math.sin(BOT.tremT*11.3)*0.006 + Math.sin(BOT.tremT*3.7)*0.010;
  var err = wantRel + BOT.noise + trem;
  if(BOT.fixT > 0){
    BOT.fixT -= dt;
    BOT.aimVel += clamp(-BOT.aimVel, -22*dt, 22*dt);
  }else{
    var gain = (Math.abs(err) > 0.6) ? 6.4 : 4.2;
    var desired = clamp(err*gain, -vmax, vmax);
    BOT.aimVel += clamp(desired - BOT.aimVel, -15*dt, 15*dt);
    if(BOT.fleeT <= 0 && Math.abs(err) < 0.10 && Math.abs(BOT.aimVel) < 0.8)
      BOT.fixT = 0.10 + botLookRnd()*0.22;
  }
  input.lookX -= BOT.aimVel*dt;             // player.yaw -= input.lookX
  /* 上下。以前は水平へ戻すだけで、ずっと真正面を向いたままだった。
     歩いているあいだの視線の揺れは、ゆっくりした乱数で作る（人は 2〜5 秒に
     一度くらい見る高さを変える）。首を振る速さは左右より遅くしてある。 */
  BOT.idleT -= dt;
  if(BOT.idleT <= 0){
    BOT.idleT = 1.6 + botLookRnd()*3.0;
    /* 暗い場所を歩くときは足元寄りを見がちで、たまに顔を上げて先を確かめる。
       9 割は −0.26〜+0.05（やや下向き）、1 割は顔を上げる。 */
    BOT.idlePitch = (botLookRnd() < 0.1) ? (0.06 + botLookRnd()*0.16)
                                         : (-0.26 + botLookRnd()*0.31);
  }
  // 段差のない揺れだと機械的に見えるので、ゆっくりした波を重ねる
  BOT.idlePitch2 = Math.sin(player.time*0.55) * 0.035 + Math.sin(player.time*0.23) * 0.025;
  var wantPitch = botPitchTarget(BOT.fleeT > 0) + BOT.idlePitch2;
  // 物音の方を振り返るときは、顔も少し上げる
  if(BOT.lookBackT > 0) wantPitch += 0.10;
  var dp2 = clamp(wantPitch - player.pitch, -2.2*dt, 2.2*dt);
  input.lookY -= dp2;                            // player.pitch -= input.lookY なので符号を反転
}

/* --- 一フレームの流れ ------------------------------------------------------
   知覚 → 事実 → 方針 → 操作 の 4 段に分ける。
   もとは 470 行の一本道で、どの判断がどの入力に効くのかを追えなくなっていた。
   それで実際に踏んだ事故が 2 つある。
     ・拾い物への寄り道が回避補正より後ろにあり、回避を丸ごと上書きしていた
     ・逃走の行き先が逃走中しか更新されず、切れた追跡の行き先を持ち越していた
   どちらも「後ろの段が前の段を書き潰す」形だった。段を分けて、
   体の向きを決めるのは botAim 一箇所だけにする。

   F（事実）… その瞬間に知覚できたこと。ここより後では作らない。
   A（方針）… どこへ向かい、走るか、前へ出るか。向きの補正はまだ掛けない。 */
function botUpdate(/** @type {number} */ dt){
  if(!BOT.ready) return;
  BOT.noteT -= dt;
  botScan();
  botHear(dt);                    // 隠れている間も向きは追う（出る判断に使う）

  var F = botFacts();
  if(botHidden(dt, F)) return;    // 箱の中にいるなら、そこで完結する

  botTrackHunter(dt, F.saw);
    /* 危険地図には「耳の推定」を入れる。BOT.hpos は最後に姿を見た位置で、
     実測で 12〜25 秒古いことがほとんどだった。聴覚が前後を持った今は
     向きが正確なので、こちらの方が使える。 */
  botMarkDanger(dt, F.th, F.saw ? { x:hunter.x, z:hunter.z }
                                  : (F.th > 0.05 ? botEstHunter(botHearRel(), F.th) : null));
  botMood(dt, F);

  var A = F.flee ? botPlanFlee(dt, F) : botPlanExplore(dt, F);
  botAim(dt, F, A);
  var moving = botFeet(A, F);
  botLamp(dt, F);
  botHands(dt, F);
  botUnstick(dt, F, moving);
}

/* --- 事実：いま知覚できていること ----------------------------------------- */
function botFacts(){
  var F = { th:botThreat(), saw:false, sawRel:0, danger:false, flee:false };
  if(hunter.group && hunter.group.visible){
    var hb = botBearing(hunter.x, hunter.z);
    var hdd = Math.sqrt((hunter.x-player.x)*(hunter.x-player.x)+(hunter.z-player.z)*(hunter.z-player.z));
    if(hdd < botEyeRange() && Math.abs(hb) < 1.08 &&
       hasSight(world.grid, player.x, player.z, hunter.x, hunter.z)){
      F.saw = true; F.sawRel = hb;
    }
  }
    /* 走っている足音が聞こえたら、音量が上がりきる前に動き出す。
     音量だけを見ていると約 13m まで気づけず、相手の視認距離 20m のあいだに
     7m ぶん無償で詰められていた。 */
  /* 走っている足音は、それだけで危険。音量の条件を外す。
     追跡の足音が鳴るのは相手が chase 状態のときだけで、
     そのとき音がまだ小さいのは「遠い」ではなく「壁越し」であることが多い。 */
  F.chaseHeard = (player.time - BOT.ear.stepT) < 0.9 && BOT.ear.stepChase && F.th > 0.06;
  F.danger = F.saw || (F.th > 0.42 && !BOT.ear.muffled) || F.chaseHeard;
  return F;
}

/* --- 箱の中にいるあいだ ---------------------------------------------------- */
function botHidden(/** @type {number} */ dt, /** @type {any} */ F){
  if(!player.hiding){ BOT.hideT = 0; BOT.quietT = 0; holdBtnDown = false; return false; }
  input.keys.KeyW = input.keys.KeyS = input.keys.KeyA = input.keys.KeyD = input.keys.ShiftLeft = false;
    /* カルテを全部集めたら隠れない。ゲームがそこで「何かが、こちらへ向かって
     いる」と告げるとおり、以降は隠れても居場所を嗅ぎつけられる。実測でその
     区間の 35% をロッカーの中で過ごし、そのあいだ相手はまっすぐ歩いてきていた。
     追跡者は hunt 状態が 57% で、その速度 3.27 m/s はこちらの 5.755 m/s より
     遅い。走れば振り切れる相手から、隠れて待っていた。 */
  if(player.got >= player.need){
    holdBtnDown = false;
    if(BOT.useCd <= 0){ input.use = true; BOT.useCd = 0.8; BOT.hideT = 0; botSay('隠れても無駄だ'); }
    BOT.useCd -= dt;
    return true;
  }
      // 殴られている＝見つかっている。箱の中にいても意味がないので出て走る
    if(player.hp < BOT.lastHp){
      BOT.lastHp = player.hp;
      if(BOT.useCd <= 0){ input.use = true; BOT.useCd = 0.5; holdBtnDown = false; botSay('見つかった。出る'); }
      return true;
    }
    /* 息を止めるのは相手が近いときだけ。
       隠れていて音で気づかれるのは 3.2m 以内（updateHunter の hiding 分岐）で、
       そこを外れていれば吸っていても聞かれない。止めっぱなしだと 6.2/s で
       16 秒ほどで尽き、breathLock が立って「息を吸う音」で自分から居場所を
       教えることになる。いちばん危ないときに札を切れない状態で迎える。

       距離と気配の対応を実測した（hunt 状態）:
         3.2m → 0.355   6m → 0.092   9m → 0.072   18m → 0.025
       閾値 0.10 はおよそ 6m 相当で、3.2m のほぼ倍の余裕がある。
       いちど止めたら 0.07 を切るまで続ける（境界での往復を避ける）。

       以前この案を 25%→6% の悪化として捨てたが、あの測定は隠れ場所の距離条件も
       同時に変えていて原因を分離できていなかった。棄却の根拠が不正だった。 */
    var thHide = botThreat();
    if(thHide > 0.10) BOT.breathOn = true;
    else if(thHide < 0.07) BOT.breathOn = false;
    holdBtnDown = BOT.breathOn;
    if(player.lamp && BOT.lampCd <= 0){ toggleLamp(); BOT.lampCd = 2; }   // 明かりが漏れる
    BOT.lampCd -= dt;
    BOT.hideT += dt;
    BOT.useCd -= dt;
    /* 出るのが早すぎた。閾値 0.07 は約 9m 相当で、hunt 中の相手が
       まだこちらへ歩いてくる距離。しかも一瞬でも下回れば出ていたので、
       壁の陰を通り過ぎただけの谷で飛び出していた。
       「静かな状態が続いた時間」を貯め、それが 3 秒たまってから出る。
       ただし箱の中では時間だけが減るので、40 秒で見切りをつける。 */
    if(thHide < 0.045) BOT.quietT += dt;
    else if(thHide > 0.08) BOT.quietT = 0;
    var leave = (BOT.quietT > 3.0 && BOT.hideT > 5.0) ||
                (BOT.hideT > 40 && thHide < 0.10);
    if(leave && BOT.useCd <= 0){
      input.use = true; BOT.useCd = 0.8; BOT.hideT = 0; BOT.quietT = 0;
      holdBtnDown = false; botSay('出る');
    }
    return true;
}

/* --- 気分：逃走・警戒・被弾への反応 ---------------------------------------- */
function botMood(/** @type {number} */ dt, /** @type {any} */ F){
    if(F.danger){
    /* 逃げ始める瞬間に、前の逃走で使った行き先を捨てる。
       escGoalT は逃走中しか減らないので、切れた追跡の続きから
       古い行き先を最大 3 秒引きずっていた。「逃げる向きが決まるのが遅い」
       「追跡が切れた直後に敵の方へ行く」はどちらもこれが原因。 */
    if(BOT.fleeT <= 0){
      BOT.escGoal = null; BOT.escGoalT = 0; BOT.escT = 0; BOT.escWp = null;
    }
    BOT.fleeT = 3.0; BOT.unseenT = 0;
  } else BOT.unseenT += dt;
  BOT.hideSkipT -= dt;
  BOT.fleeT -= dt;
  F.flee = BOT.fleeT > 0;   // 被弾の反応より前。元の順番を保つ
  BOT.cautionT = (F.th > 0.16) ? 2.0 : Math.max(0, BOT.cautionT - dt);

  // 殴られた直後は 0.9m 弾き飛ばされ、相手は 3.0 秒硬直する。
  // 逃げ先を引き直して、この硬直のあいだに距離を稼ぐ
  if(player.hp < BOT.lastHp){
    BOT.lastHp = player.hp;
    BOT.escT = 0; BOT.escGoalT = 0; BOT.escWp = null; BOT.escGoal = null;
    BOT.fleeT = Math.max(BOT.fleeT, 4.0);
  }else if(player.hp > BOT.lastHp) BOT.lastHp = player.hp;
}

/* --- 方針：逃げる ---------------------------------------------------------- */
function botPlanFlee(/** @type {number} */ dt, /** @type {any} */ F){
  var A = { rel:0, fwd:true, run:false, hideMove:false };
  var th = F.th, sawHunter = F.saw;
      botSay('見つかった');
    var srcRel = sawHunter ? F.sawRel : botHearRel();
    var hpos = BOT.hpos || botEstHunter(srcRel, th);
    /* 追われている最中は隠れない。
       追跡中の相手は最後に見た場所へ真っ直ぐ来るので、箱に入るのは
       動く的をやめて止まった的になるだけ。実測でも、距離を 4.5→7.5m まで
       広げて逃げ切りかけたところで隠れ、そのまま殴られ続けて死んでいた。
       隠れるのは「まだ追われていないが気配がある」ときだけにする。

       ただし例外がひとつある。壁を挟んで姿が切れている瞬間に箱へ入ると
       hideSeen が立たず、hunter.memT も 0 に落ちて追跡が完全に切れる。
       走力差 6% では走って振り切れないので、これが唯一の確実な逃げ道。
       条件は「相手が見えていない」かつ「音が壁越し（＝視線も通っていない）」。
       カルテを全部集めた後は居場所を嗅ぎつけられるので、この手は使わない。 */
    /* 計測：この手が決まった 10 回はすべて追跡が切れ、中で殴られた回数は 0。
       効かないのではなく「その瞬間に箱が近くにない」のが問題だった
       （逃走 446 秒のうち、壁越し かつ 箱が 7m 以内 は 51 秒しかない）。
       そこで逃走の行き先そのものを箱にして、着く頃には壁の陰にいる状態を作る。 */
    var hcut = null, hcd = 1e9, hcutH = null, hcdH = 1e9;
    var HP2 = (BOT.belAge < 1.5 && BOT.bel) ? BOT.bel : hpos;
    if(player.got < player.need){
      for(var hi=0; hi<BOT.seen.length; hi++){
        var hs2 = BOT.seen[hi];
        if(hs2.kind !== '隠れ場所') continue;
        // 直前に入れなかった箱は少しのあいだ候補から外す
        if(BOT.hideSkipT > 0 && BOT.hideSkip === (hs2.ref || hs2)) continue;
        var hdp = Math.sqrt((hs2.x-player.x)*(hs2.x-player.x)+(hs2.z-player.z)*(hs2.z-player.z));
        /* 難易度で走力差がまるで違う。静穏は追跡者 4.47 に対しこちら 5.755 で
           余裕 29% あり、走って振り切れる。通常以上は 5.40 対 5.755 で 6% しかなく、
           走って逃げ切るという前提が成り立たない（実測の振り切り率は
           静穏 96% に対し通常 70%）。難しいほど箱を頼る。
           自分が選んだ難易度は人も知っている情報なので、これは読んでよい。
           「気配が減らないなら箱へ」という自己観測で代用する案も試したが、
           通常 30.6% / 静穏 79.2% とどちらも悪化した（気配が揺れて当てにならない）。 */
        if(hdp > (settings.diff > 0 ? 24 : 17)) continue;
        // 相手を挟んだ向こう側の箱へ走るのは、相手に向かって走るのと同じ
        var hdh = hpos ? Math.sqrt((hs2.x-hpos.x)*(hs2.x-hpos.x)+(hs2.z-hpos.z)*(hs2.z-hpos.z)) : 99;
        if(hdh < hdp + 2.5) continue;
        /* 「相手の推定位置から視線が通っていない箱」に +16 して点数で選ぶ案は
           60 試行で 10.0% → 6.7% と落ちた。遠回りの損が、角の陰に入れる得を
           上回る。近い箱をそのまま選ぶ。 */
        /* 相手から視線の通らない箱を先に選ぶ。
           箱に着いても入れないのが取りこぼしの正体で、実測（60 本）では
           追跡 101 回のうち箱で終わったのは 18 回。逆に入れさえすれば
           ほぼ確実に切れる（入った 104 回のうち見られていたのは 2 回だけ）。
           見当は足音から立てた新しいほうを使う。 */
        if(HP2 && !botLOSKnown(HP2.x, HP2.z, hs2.x, hs2.z)){
          if(hdp < hcdH){ hcdH = hdp; hcutH = hs2; }
        }else if(hdp < hcd){ hcd = hdp; hcut = hs2; }
      }
      if(hcutH && hcdH < hcd + 12){ hcut = hcutH; hcd = hcdH; }
      else if(!hcut && hcutH){ hcut = hcutH; hcd = hcdH; }
    }
    /* 箱へ向かうのは、視線が切れているあいだだけ。
       見られたまま走っても入れないし、そもそも近づいた時点で hunter.lastSeen が
       その箱に設定されるので、隠れ場所を教えに行くのと同じになる。
       muffled（音が壁越し＝視線も通っていない）を、向かう条件そのものにする。
       ちらつきで往復しないよう、切れているあいだ 1.2 秒ぶんの猶予を貯めておく。 */
    if(BOT.ear.muffled && !sawHunter) BOT.hideGoT = (settings.diff > 0 ? 2.0 : 1.2);
    else BOT.hideGoT -= dt;
    /* 絶望では「視線が切れているあいだだけ箱へ向かう」では遅すぎる。
       走力差 0.6%・2 発で死ぬ・追跡の 55% が 8 秒を超え、その 84% で被弾。
       走って逃げ切る目が無い以上、行き先は最初から箱にする。
       途中で見られていても構わない——入る瞬間だけ見られていなければ
       追跡は切れる（hideSeen は入った瞬間の視線だけで決まる）。
       箱に着いて入れなければ、そのまま走り抜けて別の箱を選ぶ。 */
    var boxFirst = settings.diff >= 2;
    if(hcut && player.got < player.need && (BOT.hideGoT > 0 || boxFirst)){
      var hcc = worldToCell(hcut.x, hcut.z);
      var hAim = botPathAim(hcc.x, hcc.y);
      A.rel = botBearing(hAim ? hAim.x : hcut.x, hAim ? hAim.z : hcut.z);
      A.run = hcd > 2.0;
      botSay(BOT.ear.muffled ? '壁の陰だ。隠れる' : '隠れ場所へ');
      BOT.useCd -= dt;
      // 入るところを見られたら意味がない。姿が切れている瞬間だけ入る
      var hreach = (hcut.ref && hcut.ref.reach) ? hcut.ref.reach - 0.15 : 1.85;
      if(hcd < hreach){
        if(!sawHunter && BOT.ear.muffled && BOT.useCd <= 0){
          input.use = true; BOT.useCd = 0.5; BOT.hideWaitT = 0;
        }else{
          // 着いたのに入れないまま留まると箱の周りを回る。すぐ諦めて逃走に戻る
          BOT.hideWaitT += dt;
          if(BOT.hideWaitT > 0.4){
            BOT.hideSkip = hcut.ref || hcut; BOT.hideSkipT = 7; BOT.hideWaitT = 0;
            botSay('入れない。別を探す');
          }
        }
      }else BOT.hideWaitT = 0;
    }else{
      /* 行き先は 3 秒保ち、そこへの経路だけ 0.4 秒ごとに引き直す。
         行き先まで変えると向きが揺れて失速する。 */
      BOT.escT -= dt; BOT.escGoalT -= dt;
      if(BOT.escGoalT <= 0 || !BOT.escGoal){
        var stp = botFleeStep(hpos);
        BOT.escWp = (BOT.escGoal ? botFleeAim(BOT.escGoal.x, BOT.escGoal.y) : null) ||
                    (stp ? cellToWorld(stp.x, stp.y) : null);
        BOT.escGoalT = 3.0; BOT.escT = 0.25;
        if(!BOT.escWp) BOT.escWorld = player.yaw + botPickEscape(botAway(srcRel), hpos);
      }else if(BOT.escT <= 0 && BOT.escGoal){
        BOT.escWp = botFleeAim(BOT.escGoal.x, BOT.escGoal.y) || BOT.escWp;
        BOT.escT = 0.25;
        // 行き先に着いたら選び直す
        var gw2 = cellToWorld(BOT.escGoal.x, BOT.escGoal.y);
        if(Math.sqrt((gw2.x-player.x)*(gw2.x-player.x)+(gw2.z-player.z)*(gw2.z-player.z)) < CELL) BOT.escGoalT = 0;
      }
      A.rel = BOT.escWp ? botBearing(BOT.escWp.x, BOT.escWp.z)
                          : botNorm(BOT.escWorld - player.yaw);
      A.run = true;
    }
  BOT.repath = 0;
  return A;
}

/* --- 方針：探索する -------------------------------------------------------- */
function botPlanExplore(/** @type {number} */ dt, /** @type {any} */ F){
  var A = { rel:0, fwd:true, run:false, hideMove:false, backing:false };
  var th = F.th, sawHunter = F.saw;
  BOT.repath -= dt;
      if(!BOT.goal || BOT.repath <= 0 || (BOT.goal.obj && BOT.goal.obj.taken)){
      var g = botChooseGoal();
      BOT.goal = g;
      BOT.repath = (g.kind === '探索') ? 0.7 : 0.4;
      var tgt = (g.x !== null) ? worldToCell(g.x, g.z) : botFrontier();
      if(tgt){
        var aim = botPathAim(tgt.x, tgt.y);
        var nx = botPathNext(tgt.x, tgt.y);
        BOT.wp = aim || (nx ? cellToWorld(nx.x, nx.y) : (g.x !== null ? {x:g.x, z:g.z} : BOT.wp));
        BOT.pathLen = nx ? nx.len : 0;
      }
      botSay(g.kind === '探索' ? '探索中' : (g.kind + 'へ'));
    }
    if(BOT.wp){
      var d2g = (BOT.goal && BOT.goal.x !== null)
        ? Math.sqrt((BOT.goal.x-player.x)*(BOT.goal.x-player.x)+(BOT.goal.z-player.z)*(BOT.goal.z-player.z))
        : 99;
      var ax = (d2g < CELL*0.9) ? BOT.goal.x : BOT.wp.x;
      var az = (d2g < CELL*0.9) ? BOT.goal.z : BOT.wp.z;
      A.rel = botBearing(ax, az);
    }
    /* 「目的地が 5 マス以上先」を走る条件にしていたが、これが 86% の時間で
       不成立で、探索のダッシュ率は 11%、平均速度 2.93 m/s しか出ていなかった。
       条件を外すと 収集 +16% に対し 被弾 +6% で、カルテ/被弾 は 1.03 → 1.15。
       スタミナは制約になっていない（走行 6.47/s に対し歩行中の回復が 26/s）。 */
    /* 相手が 26m 以内にいるあいだは歩いて足音を殺す案を測った（走れば
       足音は 25.6m、歩けば 16m まで届く）。60 試行で 18.3% → 11.7%、
       被弾は 0.63/100s で変わらなかった。聞かれること自体は死因ではない。 */
    /* 終盤は止まらない。カルテを全部集めると相手はこちらの居場所を
       嗅ぎつけ続けるので隠れる意味が無く、代わりに mode は hunt に留まる。
       hunt の速度は 4.270×1.05＝4.484 m/s で、こちらの疾走 5.755 より遅い。
       つまり終盤だけは走り続ければ確実に離せる。それを、気配が近いと
       歩きに落とす cautionT と スタミナ 55 の閾値が邪魔していた。 */
    A.run = world.endgame ? !BOT.blown : (BOT.cautionT <= 0 && player.stamina > 55);

    /* まだ見つかってはいない段階での対処。
       このゲームは走力差が 6% しかなく、追われてから振り切るのは現実的でない。
       用意されている答えは隠れること（隠れ場所と「入るところを見られたか」の
       判定がある）。足音が近づいてきて、まだ見られていないうちに入る。 */
    var hh0 = botNearest('隠れ場所');
    var hd0 = hh0 ? Math.sqrt((hh0.x-player.x)*(hh0.x-player.x)+(hh0.z-player.z)*(hh0.z-player.z)) : 1e9;
    /* 最後の 1 枚を残して待っている間は集めるものが無い。無理に動かず早めに隠れる */
    /* 気配 0.14 は約 7m。そこから箱まで走っても間に合わないので、
       これまでの「隠れる」は始める時点で手遅れだった。
       もっと遠い（＝早い）段階で決める。0.07 は約 11m 相当。 */
    /* 難易度で「隠れるしかない度合い」がまるで違う。
       絶望は追跡 5.72 に対しこちらの全力 5.755 で余裕 0.6%、しかも 2 発で
       死ぬ。走って振り切る目はないので、気配を感じたら早め・遠めから
       箱へ向かう。実測（絶望 40 本）：追跡 93 回のうち箱で終わったのは
       31% しかなく、8 秒を超えた追跡の 84% で被弾していた。 */
    /* 引き金を「気配の大きさ」から「足音で測った距離」に変え、
       25m 手前から隠れに行かせてみたが、60 試行で 18.3% → 13.3%。
       被弾は 0.63 → 0.60/100s しか下がらず、走破が 410 → 450 秒に伸びて
       差し引きで負けた。遠くにいる相手から隠れても、そもそも見つからない。
       引き金は元の気配の大きさに戻す。 */
    var hard = settings.diff >= 2;
    var hThLo = BOT.seekExit ? (hard ? 0.040 : 0.055) : (hard ? 0.045 : 0.07);
    var hDist = BOT.seekExit ? (hard ? 22 : 15) : (hard ? 20 : 11);
    /* 間に合わない箱へは向かわない。
       着く前に見つかれば、入っても hideSeen が立って意味がないうえ、
       そこまでの往復がまるごと時間の損になる。
       着くまでの時間と、相手が詰めてくるまでの時間を比べる。
       相手の距離は気配の強さから、詰める速さは追跡の最大 4.473 m/s で見る。
       箱が相手のいる側にあるときも向かわない（教えに行くのと同じ）。 */
    var hideOK = false;
    if(hh0){
      var hDistEst = clamp(2.2 / Math.pow(Math.max(th, 0.012), 0.6), 2.0, 26);
      var tReach = hd0 / (hd0 > 3 ? 5.755 : 3.111) + 0.5;      // 走って行って入るまで
      /* 詰めてくる速さ。4.473 は静穏の追跡速度で、絶望は 5.72 ある。
         固定値のままだと「間に合う」と判断して間に合わない箱へ走っていた。 */
      var chaseSpd = DIFF[settings.diff].hunterSpeed * DIFF[settings.diff].chaseMul;
      var tThreat = Math.max(0, hDistEst - 4.0) / chaseSpd;     // 見つかるまで
      var boxRel = Math.abs(botNorm(botBearing(hh0.x, hh0.z) - botHearRel()));
      hideOK = (tReach + 0.6 < tThreat) && (boxRel > 0.7);
    }
    /* 絶望だけ「間に合う箱」の条件を外し、足音で測った距離 22m を引き金に
       してみたが、240 試行で 12.5% → 7.9%。被弾は 0.82 → 0.77/100s と
       わずかに下がるのに、クリアはむしろ減った。隠れて凌いだぶん走破が
       伸び、そのぶん別の場面で被弾していた。条件は元のまま。 */
    if(hideOK && th > hThLo && th < 0.55 && BOT.ear.muffled && hh0 && hd0 < hDist && !sawHunter && BOT.fleeT <= 0){
      A.hideMove = true;
      A.rel = botBearing(hh0.x, hh0.z);
      A.run = (hd0 > 3 && player.stamina > 20);
      A.fwd = true;
      botSay('隠れる');
      if(hd0 < 1.9 && BOT.useCd <= 0){ input.use = true; BOT.useCd = 0.5; }
    }
    /* 「入らずに箱の脇で待つ」も測った（相手が 19m 以内、箱が 15m 以内で
       箱まで下がり、1.5m まで寄ったら止まる）。240 試行で 10.8% → 5.8%、
       被弾は 0.76 → 0.85/100s。止まって待つと、こちらから見つけに行くのと
       同じだった。追跡開始時の箱の近さと生死の相関（無傷 1.5m / 被弾 14m）は
       因果が逆で、「危ないから箱へ寄っていた」ほうが正しい。 */
    /* 離れると決めたら離れる。毎フレーム条件を評価し直していたので、
       離れる → 目標へ戻る → また離れる、を細かく繰り返していた。
       走ってくる足音を引き金に加え、いちど決めたら 1.2 秒は続ける。 */
    var stepNear = (player.time - BOT.ear.stepT) < 1.0 && BOT.ear.stepChase;
    if(BOT.backT <= 0 && (stepNear || (th > 0.24 && !BOT.ear.muffled))) BOT.backT = 1.2;
    if(BOT.backT > 0 && !A.hideMove){
      BOT.backT -= dt;
      var src2 = botAvoidSrc();
      var sr = src2 ? src2.rel : botHearRel();
      BOT.escT -= dt;
      if(BOT.escT <= 0){
        BOT.escWorld = player.yaw + botPickEscape(botAway(sr), BOT.hpos || botEstHunter(sr, th));
        BOT.escT = 0.8;
      }
      A.rel = botNorm(BOT.escWorld - player.yaw);
      A.run = player.stamina > 22;
      A.backing = true;
      botSay('近い。離れる');
    }

    /* 気配のする向きへ、正面から寄っていかない。
       探索の目的地はマップ上の都合だけで決まるので、まだ見つかっていない
       段階で相手へ真っ直ぐ歩いていく局面が実測で 46% あった。
       進みたい向きが音源の向きに近すぎるなら、外側へ振って迂回する。
       隠れに行く途中（hideMove）は箱が最優先なので触らない。 */
    if(!sawHunter && !A.hideMove && !A.backing && BOT.lookBackT <= 0) A.rel = botAvoidRel(A.rel);

    /* 角では首を振って左右を確かめる。
       ただし壁しかない一本道でも振っていて、そのたび減速していた（run=false）。
       実際に脇道が開いている側だけを見る。両側とも壁なら振らない。 */
    BOT.glanceT -= dt;
    if(BOT.glanceHold > 0){
      BOT.glanceHold -= dt;
      A.rel = A.rel + BOT.glanceDir * 0.84;
      A.run = false;
    }else if(BOT.glanceT <= 0){
      BOT.glanceT = 2.6 + botRnd()*3.4;
      var gnear = botNearProps();
      var gl = botDirOpen(1.45, 2.4, gnear), gr = botDirOpen(-1.45, 2.4, gnear);
      if(gl || gr){
        BOT.glanceHold = 0.45 + botRnd()*0.35;
        BOT.glanceDir = (gl && gr) ? ((botRnd()<0.5) ? -1 : 1) : (gl ? 1 : -1);
      }else{
        BOT.glanceT = 1.0;                  // 次の角までは短い間隔で見直す
      }
    }
    /* 背後で足音が鳴ったら振り返る。
       ここは実機で「足音が近づくと挙動不審になってその場に留まる」と
       指摘された箇所。原因は 3 つ重なっていた。
         ・止まる条件が stepHot（＝視線が通っている）だった。
           相手がこちらを見ながら走ってくる、いちばん止まってはいけない場面。
         ・止まる時間が 0.9 秒なのに、追跡中の足音は 0.95m ごと＝
           約 0.26 秒ごとに鳴る。切れた瞬間に鳴り直して、ほぼ永久に固まる。
         ・この間 A.fwd=false なので入力が消え、相手が詰めるあいだ棒立ちになる。
       走ってくる足音・気配が濃いとき・逃走中は振り返らない。
       振り返るのは「遠くで何か動いた」程度のときだけにして、
       いちど振り返ったら 4 秒は繰り返さない。 */
    var stepFresh = (player.time - BOT.ear.stepT) < 0.25;
    BOT.lookCd -= dt;
    if(stepFresh && !BOT.ear.stepChase && th > 0.10 && th < 0.22 &&
       BOT.lookBackT <= 0 && BOT.lookCd <= 0){
      BOT.lookBackT = 0.5; BOT.lookCd = 4.0; botSay('物音');
    }
    if(BOT.lookBackT > 0){
      BOT.lookBackT -= dt;
      A.rel = botStepRel();
      // 首は向けるが足は止めない。止まってよいのは本当に静かなときだけ
      if(th < 0.12){ A.fwd = false; A.run = false; }
    }
    // 拾った直後は少し立ち止まる（人はカルテを読む）
    if(BOT.readT > 0){ BOT.readT -= dt; A.fwd = false; A.run = false; A.rel *= 0.3; }
  return A;
}

/* --- 体の向き。補正を掛ける場所はここ一箇所だけ ---------------------------- */
function botAim(/** @type {number} */ dt, /** @type {any} */ F, /** @type {any} */ A){
    /* 壁に押しつけられたまま前へ入力し続けると、その場で殴られる。
     実測で被弾の 32% がこれだった。詰まったら少しのあいだ斜めへ逃がす */
  if(player.blockedT > 0.3 && BOT.unstickT <= 0){
    BOT.unstickT = 0.7; BOT.unstickDir = (botRnd() < 0.5) ? -1 : 1;
  }
  if(BOT.unstickT > 0){
    BOT.unstickT -= dt;
    A.rel = botNorm(A.rel + BOT.unstickDir * 1.15);
  }
    /* 寄り道（拾い物）は体の向きを決める前に混ぜる。
     ここが botSteer の後ろにあったので、体は目標を向いたまま足だけが
     拾い物へ寄り、そのうえ探索中の回避補正も後から上書きされていた。 */
  if(!player.hiding && !F.flee && !A.backing){
    var detRel = botDetour(A.rel);
    if(detRel !== null) A.rel = detRel;
    // 最後にもう一度、相手の側へ向いていないか見る（拾い物に釣られた分を戻す）
    if(!F.saw) A.rel = botAvoidRel(A.rel);
  }
  botSteer(A.rel, dt, F.flee ? 4.6 : 3.0);
}

/* --- 足：出せる 5 方向から選ぶ --------------------------------------------- */
function botFeet(/** @type {any} */ A, /** @type {any} */ F){
    /* 進む向きを選ぶ。キーで出せる向きは 5 つ（正面・斜め・真横）しかないので、
     その 5 つを体の幅で先に検査し、通るものの中から目標に一番近いものを採る。
     つまり塞がっている向きのキーは最初から押さない。

     先読みの距離は速度に比例させる。止まりかけているときに 2m 先まで
     要求すると身動きが取れなくなり、全力で走っているときに 1m しか見ないと
     間に合わない。実測で全力は 5.755 m/s なので、そこで 2.6m 見る。

     体の向き（botSteer）は目標のまま回す。人も、走る向きを横へずらしながら
     顔は進みたい方へ向ける。 */
  var spdNow = Math.sqrt(player.vx*player.vx + player.vz*player.vz);
  var reach = 0.75 + spdNow*0.32;
  var nearP = botNearProps();
  var CAND = [0, 0.785, -0.785, 1.571, -1.571];
  var pick = null, pickCost = 1e9;
  /* どの向きも塞がっているなら、先読みを詰めてもう一度見る。
     見きれずに止まったままだと、狭いところで永久に固まる。
     実際、進行方向を細かく選ぶ版ではこれで 45% のフレームが入力ゼロになった。
     人も、行き止まりで固まらずに半歩ずつ探る。 */
  /* 通るかどうかだけでなく、どれだけ先まで通るかも見る。
     同じ「通る」でも、すぐ先で詰まる向きを選ぶとその場でこすり続ける。
     余裕のある向きを少し優遇する（体の向きは目標のまま。ここを変えると
     目標に寄っていけなくなり、実測で打ち切りが 43 → 110 本に増えた）。 */
  for(var pass=0; pass<3 && pick === null; pass++){
    var rr2 = reach * (pass === 0 ? 1 : (pass === 1 ? 0.55 : 0.3));
    pickCost = 1e9;
    for(var ci=0; ci<CAND.length; ci++){
      var cr = CAND[ci];
      if(!botDirOpen(cr, rr2, nearP)) continue;
      // その先 2 倍まで見て、余裕があるほど安い
      var room = botDirOpen(cr, rr2*2.0, nearP) ? 0.30 : 0;
      /* 目標からのずれ。真横は全力が出ない（f>0.25 を満たさない）ので少し嫌う。
         逃げているあいだは「少し」では足りなかった。目標が真横にあるとき、
         横歩き（1.571）は目標へのずれが 0 なので必ず選ばれ、W が押されず
         ShiftLeft も立たない＝歩き 3.111 m/s に落ちる。
         実測（絶望・24 本、追跡 11340 フレーム）：追跡中の実速度は 4.94 で、
         全力 5.755 に対して 0.8 m/s 足りない。相手が寄ってくる実効速度は
         4.30 m/s しかないので、真後ろへ全力で走れていれば毎秒 1.46m 離せる
         はずが、実際には毎秒 0.53m 詰められている。
         横を強く嫌えば体が向き直るまでの 0.3 秒は少し斜めに走るが、
         そのあいだも全力は出る。 */
      /* 逃走中だけ横歩きを強く嫌わせて（1.10）体の向きで走らせてみた。
         追跡中の実速度は 4.94 → 5.13 m/s に上がったが、離れる成分は
         3.77 → 3.73 と変わらず（増えたぶんが横に逃げた）、通常難易度では
         120 本で 37.5% → 23.3%、被弾 0.55 → 0.77/100s と大きく落ちた。
         横歩きは狭い通路を抜けるのに要る。 */
      var cost = Math.abs(botNorm(cr - A.rel)) + Math.abs(cr)*0.30 - room;
      /* 探索中も横歩きを強く嫌わせて（0.85）体の向きで走らせてみたが、
         壁をこする時間が 3.0% → 8.0% に増え、平均速度は 4.11 → 4.17 と
         ほとんど変わらないまま 240 試行で 12.5% → 6.7% に落ちた。
         横歩きは狭いところで壁を避けるために要る。 */
      if(cost < pickCost){ pickCost = cost; pick = cr; }
    }
  }
  /* 目標とかけ離れた向きしか空いていないなら、進まずに向き直る。
     ただし危ないときは別。棒立ちがいちばん悪い手で、
     多少見当違いでも動いていたほうがいい。 */
  var freezeOK = !F.flee && F.th < 0.10;
  if(pick !== null && freezeOK && Math.abs(botNorm(pick - A.rel)) > 1.9) pick = null;
  // 危ないのにどの向きも塞がっているなら、体の幅を詰めてでも一歩出す
  if(pick === null && !freezeOK){
    for(var ci2=0; ci2<CAND.length && pick === null; ci2++)
      if(botDirOpen(CAND[ci2], 0.45, nearP)) pick = CAND[ci2];
  }
  /* 後退。候補が前・斜め・真横の 5 つしか無かったので、袋小路や什器に
     押し込まれると 5 つとも塞がり、入力がゼロになってその場に立ち尽くす。
     実測（絶望・32本）：逃走中の 27% がこの完全停止だった。
     相手は 5.72 m/s で迫ってくるので、止まった時点で終わる。
     人なら下がる。最後の手として後ろ 3 方向を足す。
     後退では全力疾走が出ない（updatePlayer が前進成分 0.25 を要求する）ので、
     あくまで抜け出すためだけの手であり、前が空いていれば選ばれない。 */
  if(pick === null){
    var BACK = [2.356, -2.356, Math.PI];
    for(var bp=0; bp<3 && pick === null; bp++){
      var br = reach * (bp === 0 ? 0.7 : (bp === 1 ? 0.45 : 0.28));
      pickCost = 1e9;
      for(var bi=0; bi<BACK.length; bi++){
        if(!botDirOpen(BACK[bi], br, nearP)) continue;
        var bc = Math.abs(botNorm(BACK[bi] - A.rel));
        if(bc < pickCost){ pickCost = bc; pick = BACK[bi]; }
      }
    }
  }
  var moving2 = A.fwd && pick !== null;
  var apick = moving2 ? Math.abs(pick) : 0;
  input.keys.KeyW = moving2 && apick < 1.2;
  input.keys.KeyS = moving2 && apick > 1.95;
  input.keys.KeyA = moving2 && pick > 0.3 && apick < 2.95;
  input.keys.KeyD = moving2 && pick < -0.3 && apick < 2.95;
  /* スタミナはヒステリシスで使う。
     単一閾値で切ると、回復が 26/s と速いせいで閾値付近を往復し、
     走行と歩行が毎フレーム切り替わって実効速度が落ちる（4.05 m/s まで見た）。
     かといって 0 まで使い切ると player.exhausted が立ち、ゲーム側が
     35 まで回復するまで走行を禁止する。そのあいだ歩行 3.111 m/s しか出ず、
     追跡者 4.47〜5.40 に確実に捕まる（被弾直前2秒の移動が 6.1m ＝ 歩行速度だった）。
     だから「12 を切ったら走るのをやめ、45 まで戻ったらまた走る」。 */
  if(player.stamina < 12) BOT.blown = true;
  else if(player.stamina > 45) BOT.blown = false;
  input.keys.ShiftLeft = !!(A.run && !BOT.blown && input.keys.KeyW);


  return moving2;
}

/* --- ランプ ---------------------------------------------------------------- */
function botLamp(/** @type {number} */ dt, /** @type {any} */ F){
  var fleeing = F.flee, th = F.th;
    /* ランプの管理。ここがこのゲームの肝だった。
     消すと updatePlayer が速度を 0.86 倍にする。走行 5.755 に対し追跡者は
     最大 5.400 なので、消えていると 4.95 対 5.40 で必ず追いつかれる。
     一方でランプは 1.45%/秒 減り、満タンでも 69 秒しかもたない。電池は
     5 個しかないので、点けっぱなしでは中盤以降ずっと消灯＝ずっと格下になる。
     （実測: 逃走中の速度中央値が 4.95 = 5.755×0.86 ちょうどで、
       追跡者に毎秒 0.47m 詰められていた）

     なので「見る必要があるときと、速さが要るときだけ点ける」。
     既知の通路を目的地へ歩くだけなら、暗くても歩ける。 */
  BOT.lampCd -= dt;
  /* 光の配分。初期 69 秒ぶん＋電池 5 個で合計およそ 224 秒しかないのに、
     走破には 400〜600 秒かかる。つまりどうやっても半分以上は消灯で過ごす。
     消灯中は 0.86 倍で追跡者より遅いので、光は「探索」ではなく
     「追われているとき」に回す。探索は視界 6.5m でも時間をかければ進む。 */
  /* 光を節約して探索してみたら、視界 6.5m では電池そのものを見つけられず、
     暗いまま走破時間だけが伸びて余計に捕まった。光がないと光を補充できない。
     なので探索中も点ける。そのぶん電池は見つけ次第すぐ拾いに行く。 */
  /* 探索中は点滅させる。点けっぱなしだと静穏でも 95 秒で尽き、
     追われたときに消灯 4.95 m/s で必ず捕まる（被弾の 53% がこれだった）。
     消しっぱなしだと視界 6.5m で電池自体を見つけられず、暗いままになる。
     点けて見る → 消して歩く、を繰り返すのが人の使い方でもある。 */
  /* 残量が減ったら探索中の点灯を絞る。
     逃走中に消えていると速度が 0.86 倍になり、通常以上では追跡者より遅くなる
     （実測：通常の逃走平均 4.93 m/s に対し追跡者は最大 5.40）。
     実際、通常では逃走時間の 21% がランプ消灯だった。
     総光量は 通常で 325 単位 ÷ 1.5/s ＝ 217 秒ぶんしかなく、
     探索で使い切ると追われたときに残っていない。 */
  BOT.pulseT -= dt;
  if(BOT.pulseT <= 0){
    BOT.pulseOn = !BOT.pulseOn;
    /* 通常以上は光の総量が足りない（325 単位 ÷ 1.5/s ＝ 217 秒ぶんしかないのに
       走破に 400 秒かかる）。実測で逃走時間の 15% がランプ切れによる消灯で、
       そのあいだ 4.95 m/s まで落ちて追跡者の 5.40 に負ける。
       光っている物は消灯中でも見えるようにしてあるので、探索の点灯は削れる。 */
    var low = player.battery < 45 || settings.diff > 0;
    BOT.pulseT = BOT.pulseOn ? (low ? 1.2 : 2.6) : (low ? 3.6 : 2.2);
  }
  /* ランプの光は「相手の方を向いたとき」に居場所を教える。
     updateHunter は視野の外でも sight+6 まで、pdot>0.86（正面 ±30 度）で
     seen を立てる。気配のする向きを正面に入れたまま照らさない。 */
  var lampRisk = !fleeing && th > 0.06 && Math.abs(botHearRel()) < 0.62;
  var needLight = !lampRisk && (
    fleeing ||                                   // ここで消えていると必ず捕まる
    th > 0.13 ||                                 // 気配がある。すぐ走るかもしれない
    player.battery > 88 ||                       // 満タン近くは惜しまない
    BOT.pulseOn ||                               // 探索中はここで明滅する
    /* 第5章（映るもの）。消して 3 秒で寄ってくるので、囁きが聞こえたら
       点けて待つ（照らせば止まる）。人が聞いて分かる手掛かりだけを使う */
    (shade.enabled && shade.on && shade.whisperT > 0 &&
     Math.sqrt((shade.x-player.x)*(shade.x-player.x) + (shade.z-player.z)*(shade.z-player.z)) < 9));
  // 追われている間は待たずに点ける（1.2 秒の迷いが致命傷になる）
  if(fleeing && !player.lamp && player.battery > 1){ toggleLamp(); BOT.lampCd = 1.2; }
  // 残量を温存しようと消灯を増やすと、消灯時間が延びてかえって遅くなった（計測済み）
  else if(BOT.lampCd <= 0){
    if(needLight && !player.lamp && player.battery > 2){ toggleLamp(); BOT.lampCd = 1.2; }
    else if(!needLight && player.lamp){ toggleLamp(); BOT.lampCd = 1.2; }
  }
}

/* --- 手：拾う・使う -------------------------------------------------------- */
function botHands(/** @type {number} */ dt, /** @type {any} */ F){
  var fleeing = F.flee;
    // 拾う・使う
  BOT.useCd -= dt;
  if(BOT.goal && BOT.goal.x !== null && BOT.useCd <= 0 && !fleeing){
    var dd = Math.sqrt((BOT.goal.x-player.x)*(BOT.goal.x-player.x)+(BOT.goal.z-player.z)*(BOT.goal.z-player.z));
    if(dd < 2.0){
      input.use = true; BOT.useCd = 0.35;
      if(BOT.goal.kind === 'カルテ') BOT.readT = 0.8;
    }
  }
  /* 目的地でなくても、手が届くところにあるなら拾う（逃走中も）。
     nearestInteractable が返すのは実際に use が効く相手そのものなので、
     これで拾い物が返るならロッカーに誤って入ることはない。 */
  if(BOT.useCd <= 0 && !player.hiding){
    var nb = nearestInteractable();
    if(nb && nb.type === 'record' && BOT.seekExit) nb = null;   // 待っている最後の1枚は拾わない
    // 包帯も手が届けば拾う（人も通りがかりに拾う。nearestInteractable は減っているときしか返さない）
    if(nb && (nb.type === 'record' || nb.type === 'battery' || nb.type === 'key' || nb.type === 'bandage')){
      input.use = true; BOT.useCd = 0.35;
      if(nb.type === 'record' && !fleeing) BOT.readT = 0.8;
    }
  }
}

/* --- 詰まりの検出 ---------------------------------------------------------- */
function botUnstick(/** @type {number} */ dt, /** @type {any} */ F, /** @type {any} */ moving){
  var fleeing = F.flee;
    // 引っかかり
  var moved = Math.sqrt((player.x-BOT.lastX)*(player.x-BOT.lastX)+(player.z-BOT.lastZ)*(player.z-BOT.lastZ));
  BOT.lastX = player.x; BOT.lastZ = player.z;
  // 壁に押しつけている間は走れない（updatePlayer が blockedT<0.45 を要求する）
  if(fleeing && player.blockedT > 0.2){ BOT.escT = 0; BOT.escGoalT = 0; BOT.escWp = null; }
  /* 入力を出しているのに進めていないなら、経路の方が悪い。
     ここで横へ蹴り出すのはやめた（先読みが向きを選んでいるので、上書きすると
     わざわざ塞がった向きへ押し込むことになる）。経路を引き直すだけにする。 */
  if(moving && moved < 0.6*dt){
    BOT.stuck += dt;
    if(BOT.stuck > (fleeing ? 0.22 : 0.7)){
      BOT.stuck = 0; BOT.repath = 0; BOT.escT = 0; BOT.escGoalT = 0;
      var c1 = worldToCell(player.x, player.z);
      if(inBounds(c1.x,c1.y)) BOT.penalty[idx(c1.x,c1.y)] += 12;
    }
  }else BOT.stuck = Math.max(0, BOT.stuck - dt*2);

  var cc = worldToCell(player.x, player.z), ck = cc.x+','+cc.y;
  if(ck === BOT.lastCell){
    BOT.dwell += dt;
    if(BOT.dwell > 2.5){ BOT.dwell = 0;
      if(inBounds(cc.x,cc.y)) BOT.penalty[idx(cc.x,cc.y)] += 6; }
  }else { BOT.lastCell = ck; BOT.dwell = 0; }
}

// 観戦中は「いま何を考えているか」を出す。見ていて分かるように
/* pan は「プレイヤーの右ベクトルとの内積」なので、正が右・負が左。
   WebAudio の StereoPanner も -1 が左・+1 が右で、音自体は正しく鳴っていた。
   表示だけが左右逆になっていた（実機で指摘された）。
   音の向きは目で確かめられないぶん間違いに気づきにくいので、
   自己診断から呼べる形にして押さえる。 */
function panDir(/** @type {any} */ v){ return v < -0.15 ? '左' : (v > 0.15 ? '右' : '前後どちらか'); }
/* 聴覚が前後を持つようになったので、表示も 8 方位にする。
   rel は正面基準・左が＋（botBearing と同じ向き）。 */
function dirName(/** @type {any} */ rel){
  var a = botNorm(rel), q = Math.abs(a);
  if(q < 0.393) return '前';
  if(q < 1.178) return a > 0 ? '左前' : '右前';
  if(q < 1.963) return a > 0 ? '左' : '右';
  if(q < 2.749) return a > 0 ? '左後ろ' : '右後ろ';
  return '後ろ';
}

function botHUD(){
  if(skipUI) return;
  var el = $('botHud');
  if(!el) return;
  if(!BOT.on){ el.hidden = true; return; }
  el.hidden = false;
  var th = botThreat();
  // 目盛りは文字（▮▯）だと環境によって豆腐になるので、幅で描く
  var dir = dirName(botHearRel());
  /* 足音は別系統（Audio2.hunterStep）で鳴っていて、この表示は唸り声
     （setHunterVoice）しか見ていなかった。実機で足音が聞こえているのに
     「何も聞こえない」と出るのはそのため。ボット自身は足音を使っている
     （chaseHeard・振り返り）ので、表示だけが遅れていた。 */
  var stepAge = player.time - BOT.ear.stepT;
  var stepDir = dirName(botStepRel());
  var tail;
  if(stepAge < 1.2){
    tail = '足音 ' + stepDir + (BOT.ear.stepChase ? '・走ってくる' : '') +
           (BOT.ear.stepHot ? '' : '・壁越し');
  }else if(th > 0.02){
    tail = dir + (BOT.ear.muffled ? '・壁越し' : '・直接');
  }else tail = '何も聞こえない';
  // 目盛りは声と足音の濃い方を出す
  var thShow = Math.max(th, stepAge < 1.2 ? (BOT.ear.stepChase ? 0.5 : 0.3) : 0);
  el.innerHTML =
    '<b>AI</b> ' + (BOT.note || '…') +
    '<br><span>耳</span><i class="mtr"><u style="width:' + Math.round(thShow*100) + '%"></u></i>' +
    '<span>' + tail + '</span>' +
    '<br><span>見つけた ' + BOT.seen.length + ' 件 / 歩いた範囲 ' +
      Math.round(botMapped()/(GW*GH)*100) + '%</span>';
}
function botMapped(){
  if(!BOT.known) return 0;
  var n = 0;
  for(var i=0;i<BOT.known.length;i++) if(BOT.known[i]) n++;
  return n;
}


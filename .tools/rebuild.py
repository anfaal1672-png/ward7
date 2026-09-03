import re
p='/home/user/ward7/ward7.html'
s=open(p).read()

start = s.index('function botUpdate(dt){')
# 直後の、行頭 '}' までを本体とみなす
end = s.index('\n}\n', start) + 3
old = s[start:end]

def take(a, b=None):
    """old の中から a...b の断片を切り出す（b を含まない）。移設の取りこぼしを防ぐ。"""
    i = old.index(a)
    j = old.index(b, i) if b else len(old)
    return old[i:j]

new = '''/* --- 一フレームの流れ ------------------------------------------------------
   知覚 → 事実 → 方針 → 操作 の 4 段に分ける。
   もとは 470 行の一本道で、どの判断がどの入力に効くのかを追えなくなっていた。
   それで実際に踏んだ事故が 2 つある。
     ・拾い物への寄り道が回避補正より後ろにあり、回避を丸ごと上書きしていた
     ・逃走の行き先が逃走中しか更新されず、切れた追跡の行き先を持ち越していた
   どちらも「後ろの段が前の段を書き潰す」形だった。段を分けて、
   体の向きを決めるのは botAim 一箇所だけにする。

   F（事実）… その瞬間に知覚できたこと。ここより後では作らない。
   A（方針）… どこへ向かい、走るか、前へ出るか。向きの補正はまだ掛けない。 */
function botUpdate(dt){
  if(!BOT.ready) return;
  BOT.noteT -= dt;
  botScan();
  botHear(dt);                    // 隠れている間も向きは追う（出る判断に使う）

  var F = botFacts();
  if(botHidden(dt, F)) return;    // 箱の中にいるなら、そこで完結する

  botTrackHunter(dt, F.saw);
  BOTMARKDANGER
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
  CHASEHEARD
  return F;
}

/* --- 箱の中にいるあいだ ---------------------------------------------------- */
function botHidden(dt, F){
  if(!player.hiding){ BOT.hideT = 0; BOT.quietT = 0; holdBtnDown = false; return false; }
  input.keys.KeyW = input.keys.KeyA = input.keys.KeyD = input.keys.ShiftLeft = false;
  ENDGAMEHIDE
  HIDDENBODY
  return true;
}

/* --- 気分：逃走・警戒・被弾への反応 ---------------------------------------- */
function botMood(dt, F){
  MOODBODY
}

/* --- 方針：逃げる ---------------------------------------------------------- */
function botPlanFlee(dt, F){
  var A = { rel:0, fwd:true, run:false, hideMove:false };
  var th = F.th, sawHunter = F.saw;
  FLEEBODY
  BOT.repath = 0;
  return A;
}

/* --- 方針：探索する -------------------------------------------------------- */
function botPlanExplore(dt, F){
  var A = { rel:0, fwd:true, run:false, hideMove:false };
  var th = F.th, sawHunter = F.saw;
  BOT.repath -= dt;
  EXPLOREBODY
  return A;
}

/* --- 体の向き。補正を掛ける場所はここ一箇所だけ ---------------------------- */
function botAim(dt, F, A){
  UNSTICKBODY
  DETOURBODY
  botSteer(A.rel, dt, F.flee ? 4.6 : 3.0);
}

/* --- 足：出せる 5 方向から選ぶ --------------------------------------------- */
function botFeet(A, F){
  FEETBODY
}

/* --- ランプ ---------------------------------------------------------------- */
function botLamp(dt, F){
  var fleeing = F.flee, th = F.th;
  LAMPBODY
}

/* --- 手：拾う・使う -------------------------------------------------------- */
function botHands(dt, F){
  var fleeing = F.flee;
  HANDSBODY
}

/* --- 詰まりの検出 ---------------------------------------------------------- */
function botUnstick(dt, F, moving){
  var fleeing = F.flee;
  STUCKBODY
}
'''

def indent(txt, n=2):
    out=[]
    for ln in txt.split('\n'):
        out.append((' '*n + ln[2:]) if ln.startswith('  ') else ln)
    return '\n'.join(out)

parts = {
 'BOTMARKDANGER': take('  /* 危険地図には「耳の推定」を入れる。', '  if(danger){')
                    .replace('botMarkDanger(dt, th, sawHunter ?','botMarkDanger(dt, F.th, F.saw ?')
                    .replace('(th > 0.05 ? botEstHunter(botHearRel(), th) : null));','(F.th > 0.05 ? botEstHunter(botHearRel(), F.th) : null));'),
 'CHASEHEARD':    take('  /* 走っている足音が聞こえたら、', '  botTrackHunter(dt, sawHunter);')
                    .replace('var chaseHeard','F.chaseHeard').replace('th > 0.06','F.th > 0.06')
                    .replace('var danger = sawHunter','F.danger = F.saw')
                    .replace('(th > 0.42 && !BOT.ear.muffled) || chaseHeard;','(F.th > 0.42 && !BOT.ear.muffled) || F.chaseHeard;'),
 'ENDGAMEHIDE':   take('  /* カルテを全部集めたら隠れない。', '  // 隠れている間：気配が遠のいたら出る')
                    .replace('  if(player.hiding && player.got >= player.need){','  if(player.got >= player.need){')
                    .replace('    input.keys.KeyW = input.keys.KeyA = input.keys.KeyD = input.keys.ShiftLeft = false;\n','')
                    .replace('    return;\n','    return true;\n'),
 'HIDDENBODY':    take('    // 殴られている＝見つかっている。', '  BOT.hideT = 0; BOT.quietT = 0; holdBtnDown = false;')
                    .replace('      return;\n','      return true;\n').replace('    return;\n','    return true;\n')
                    .rstrip().rstrip('}').rstrip(),
 'MOODBODY':      take('  if(danger){', '  var wantRel = 0, moveFwd = true, run = false;')
                    .replace('if(danger){','if(F.danger){')
                    .replace('  var fleeing = BOT.fleeT > 0;','  F.flee = BOT.fleeT > 0;   // 被弾の反応より前。元の順番を保つ')
                    .replace('  BOT.cautionT = (th > 0.16)','  BOT.cautionT = (F.th > 0.16)'),
 'FLEEBODY':      take('    botSay(\'見つかった\');', '    BOT.repath = 0;'),
 'EXPLOREBODY':   take('    if(!BOT.goal || BOT.repath <= 0', '  /* 壁に押しつけられたまま前へ入力し続けると'),
 'UNSTICKBODY':   take('  /* 壁に押しつけられたまま前へ入力し続けると', '  /* 寄り道（拾い物）は体の向きを決める前に混ぜる。'),
 'DETOURBODY':    take('  /* 寄り道（拾い物）は体の向きを決める前に混ぜる。', '  botSteer(wantRel, dt, fleeing'),
 'FEETBODY':      take('  /* 進む向きを選ぶ。キーで出せる向きは 5 つ', '  /* ランプの管理。'),
 'LAMPBODY':      take('  /* ランプの管理。', '  // 拾う・使う'),
 'HANDSBODY':     take('  // 拾う・使う', '  // 引っかかり'),
 'STUCKBODY':     take('  // 引っかかり', None),
}

# 局所変数名を新しい入れ物へ寄せる
parts['FLEEBODY']    = parts['FLEEBODY'].replace('wantRel =','A.rel =').replace('run =','A.run =').replace('moveFwd =','A.fwd =')
parts['EXPLOREBODY'] = (parts['EXPLOREBODY'].replace('wantRel =','A.rel =').replace('run =','A.run =')
                        .replace('moveFwd =','A.fwd =').replace('wantRel +=','A.rel +=')
                        .replace('var hideMove = false;','').replace('hideMove = true;','A.hideMove = true;')
                        .replace('!hideMove','!A.hideMove').replace('A.rel *= 0.3','A.rel *= 0.3')
                        .replace('A.rel = botAvoidRel(A.rel)','A.rel = botAvoidRel(A.rel)'))
parts['EXPLOREBODY'] = parts['EXPLOREBODY'].replace('A.rel += BOT.glanceDir','A.rel = A.rel + BOT.glanceDir')
parts['EXPLOREBODY'] = parts['EXPLOREBODY'].replace('wantRel','A.rel')
parts['FLEEBODY']    = parts['FLEEBODY'].replace('wantRel','A.rel').replace('sawHunter ? hunterRel :','sawHunter ? F.sawRel :')
parts['UNSTICKBODY'] = parts['UNSTICKBODY'].replace('wantRel','A.rel')
parts['DETOURBODY']  = (parts['DETOURBODY'].replace('wantRel','A.rel')
                        .replace('!player.hiding && !fleeing','!player.hiding && !F.flee')
                        .replace('if(!sawHunter)','if(!F.saw)'))
parts['FEETBODY']    = (parts['FEETBODY'].replace('wantRel','A.rel')
                        .replace('var moving2 = moveFwd && pick !== null;','var moving2 = A.fwd && pick !== null;')
                        .replace('input.keys.ShiftLeft = !!(run &&','input.keys.ShiftLeft = !!(A.run &&')
                        + '\n  return moving2;\n')
parts['LAMPBODY']    = parts['LAMPBODY'].replace('!fleeing && th > 0.06','!fleeing && th > 0.06')
parts['STUCKBODY']   = parts['STUCKBODY'].replace('if(moving2 && moved < 0.6*dt)','if(moving && moved < 0.6*dt)')

def balance(t):
    """切り出しの端で余った '}' を落とす（中括弧の数が合うまで）。"""
    lines = t.rstrip('\n').split('\n')
    while lines:
        body = '\n'.join(lines)
        if body.count('{') >= body.count('}'):
            break
        if lines[-1].strip() in ('}', '}else{', '} else {'):
            lines.pop()
        else:
            break
    return '\n'.join(lines)

for k,v in parts.items():
    new = new.replace(k, balance(v))

s = s[:start] + new + s[end:]
open(p,'w').write(s)
print('rebuilt', len(old), '->', len(new))

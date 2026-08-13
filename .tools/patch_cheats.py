import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

rep("""var CHEATS = [
  { k:'godmode',   label:'無敵（ダメージ無効）' },
  { k:'infLamp',   label:'ランプ無限' },
  { k:'infBreath', label:'スタミナ無限' },
  { k:'fast',      label:'移動速度 2倍' },
  { k:'noclip',    label:'壁抜け' },
  { k:'freeze',    label:'追跡者を停止' },
  { k:'invisible', label:'追跡者に見つからない' },
  { k:'reveal',    label:'常に完全探知' }
];
var CHEAT_ACTS = [
  { k:'records', label:'カルテを全回収' },
  { k:'heal',    label:'体力とランプを全回復' },
  { k:'warp',    label:'非常口へワープ' },
  { k:'push',    label:'追跡者を引き離す' }
];""",
"""/* チート。切り替え式（CHEATS）と、その場で効く一発（CHEAT_ACTS）。
   使った回は記録に残さない（recordRun が cheatUsed を見ている）。
   並び順は「体を守る → 見つからない → 速く動く → 相手を弱める →
   世界を見る → 演出」。多いので節に分けてある。 */
var CHEATS = [
  { g:'身',   k:'godmode',   label:'無敵（ダメージ無効）' },
  { g:'身',   k:'infLamp',   label:'ランプ無限' },
  { g:'身',   k:'infBreath', label:'スタミナ無限' },
  { g:'身',   k:'noSanity',  label:'正気度が減らない' },
  { g:'身',   k:'regen',     label:'体力が自動で回復する' },

  { g:'隠',   k:'invisible', label:'追跡者に見つからない' },
  { g:'隠',   k:'silent',    label:'足音を立てない' },
  { g:'隠',   k:'noLampTell',label:'ランプの光で見つからない' },
  { g:'隠',   k:'ghostHide', label:'どこでも隠れられる（入る所を見られても）' },

  { g:'速',   k:'fast',      label:'移動速度 2倍' },
  { g:'速',   k:'noclip',    label:'壁抜け' },
  { g:'速',   k:'quickHands',label:'拾う・使うが即時' },

  { g:'敵',   k:'freeze',    label:'追跡者を停止' },
  { g:'敵',   k:'slowHunter',label:'追跡者の速度を半分に' },
  { g:'敵',   k:'shortMem',  label:'追跡者がすぐ見失う' },
  { g:'敵',   k:'pacifist',  label:'追跡者が攻撃してこない' },
  { g:'敵',   k:'blindEnd',  label:'終盤でも居場所が漏れない' },

  { g:'眼',   k:'reveal',    label:'常に完全探知' },
  { g:'眼',   k:'markItems', label:'カルテ・鍵・電池が壁越しに光る' },
  { g:'眼',   k:'markHides', label:'隠れ場所が壁越しに光る' },
  { g:'眼',   k:'brightWorld',label:'病棟全体が明るい' },
  { g:'眼',   k:'wideView',  label:'視野を広げる' },

  { g:'他',   k:'slowmo',    label:'スローモーション' },
  { g:'他',   k:'noShake',   label:'画面の揺れと歪みを止める' },
  { g:'他',   k:'showDebug', label:'内部の値を表示' }
];
var CHEAT_ACTS = [
  { k:'records',  label:'カルテを全回収' },
  { k:'heal',     label:'体力とランプを全回復' },
  { k:'warp',     label:'非常口へワープ' },
  { k:'push',     label:'追跡者を引き離す' },
  { k:'key',      label:'鍵を手に入れる' },
  { k:'openDoor', label:'施錠扉を開ける' },
  { k:'stun',     label:'追跡者を 10 秒止める' },
  { k:'teleHunter',label:'追跡者を遠くへ飛ばす' },
  { k:'battery',  label:'電池を全部集める' },
  { k:'mapAll',   label:'地図を全部知る（AI観戦用）' },
  { k:'win',      label:'即座に脱出する' },
  { k:'lose',     label:'即座に力尽きる' }
];""", 'defs')
open(p,'w').write(s)
print('チート定義を拡張')

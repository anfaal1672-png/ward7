# UI 刷新のパッチ。コンテナが巻き戻ってもすぐ再適用できるよう、
# 手順そのものをファイルに残す（この作業中に 6 回巻き戻っている）。
import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old, new, tag):
    global s
    assert old in s, tag
    s = s.replace(old, new, 1)

rep("""  #vitals{
    position:absolute;z-index:3;left:calc(14px + var(--sal));top:calc(12px + var(--sat));
    width:min(220px,46vw);border:1px solid var(--line);border-radius:2px;
    background:rgba(5,9,10,.55);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);padding:8px 10px 6px
  }
  #ecg{display:block;width:100%;height:34px}
  .meter{margin-top:7px;font-family:var(--mono);font-size:9.5px;letter-spacing:.18em;color:var(--dim)}
  .meter .bar{height:4px;background:rgba(232,226,212,.1);margin-top:4px;border-radius:1px;overflow:hidden}
  .meter .bar i{display:block;height:100%;width:100%;transform-origin:left;transition:transform .18s linear}""",
"""  /* 計器は「必要なときだけ現れる」。枠と背景をやめ、地の暗さの上に線だけを置く。
     値が動かない間はそっと沈み、変化した瞬間に立ち上がる。
     常に同じ明るさで出ていると、画面の中でいちばん明るいものがずっと
     自分の数字になってしまい、暗がりの方を見なくなる。 */
  #vitals{
    position:absolute;z-index:3;left:calc(16px + var(--sal));top:calc(14px + var(--sat));
    width:min(212px,46vw);padding:0;
    opacity:.30;transition:opacity .45s ease;
    filter:drop-shadow(0 1px 3px rgba(0,0,0,.9));
  }
  #vitals.awake{opacity:1}
  #ecg{display:block;width:100%;height:34px}
  .meter{margin-top:9px;font-family:var(--mono);font-size:9px;letter-spacing:.22em;color:var(--dim)}
  /* 目盛りは 20 分割の刻み。連続した棒より、減った量が読み取りやすい */
  .meter .bar{height:5px;margin-top:5px;position:relative;overflow:hidden;
    background:repeating-linear-gradient(90deg,
      rgba(232,226,212,.13) 0 calc(5% - 1.5px), transparent calc(5% - 1.5px) 5%)}
  .meter .bar i{display:block;height:100%;width:100%;transform-origin:left;
    transition:transform .18s linear;
    -webkit-mask:repeating-linear-gradient(90deg,#000 0 calc(5% - 1.5px), transparent calc(5% - 1.5px) 5%);
    mask:repeating-linear-gradient(90deg,#000 0 calc(5% - 1.5px), transparent calc(5% - 1.5px) 5%)}""", 'vitals')

rep("""  #objective{
    position:absolute;z-index:3;right:calc(14px + var(--sar));top:calc(12px + var(--sat));text-align:right;
    font-family:var(--mono);font-size:10px;letter-spacing:.2em;color:var(--dim)
  }
  #objective b{display:block;font-size:26px;letter-spacing:.02em;color:var(--bone);font-weight:600;margin-top:2px}""",
"""  #objective{
    position:absolute;z-index:3;right:calc(16px + var(--sar));top:calc(14px + var(--sat));text-align:right;
    font-family:var(--mono);font-size:9px;letter-spacing:.24em;color:var(--dim);
    opacity:.34;transition:opacity .45s ease;
    filter:drop-shadow(0 1px 3px rgba(0,0,0,.9));
  }
  #objective.awake{opacity:1}
  /* 枚数は数字だけを大きく置く。単位は小さく添える */
  #objective b{display:block;font-size:30px;letter-spacing:0;color:var(--bone);
    font-weight:200;font-family:var(--sans);margin-top:1px;line-height:1}
  #objective b .of{font-size:14px;color:var(--dim);font-weight:300;margin-left:2px}""", 'objective')

rep("""  #cheatBadge{position:absolute;""",
"""  /* 体力が減っている間、画面の縁がうっすら赤い。数字を見にいかなくても
     「まずい」が視界の端で分かる。殴られた瞬間の赤（#hurt）とは別で、
     こちらは状態を示すので消えない。 */
  #lowhp{position:absolute;inset:0;z-index:2;pointer-events:none;opacity:0;
    transition:opacity .6s ease;
    background:radial-gradient(120% 90% at 50% 50%,transparent 45%,rgba(140,38,38,.42) 100%)}
  #cheatBadge{position:absolute;""", 'lowhp-css')

rep("""  <div id="hideView"></div>""", """  <div id="lowhp"></div>
  <div id="hideView"></div>""", 'lowhp-dom')

rep("""    <b><span id="numGot">0</span>/<span id="numAll">5</span></b>""",
    """    <b><span id="numGot">0</span><span class="of">/<span id="numAll">5</span></span></b>""", 'numGot')

rep("""  #note{position:absolute;z-index:3;left:50%;bottom:calc(136px + var(--sab));transform:translateX(-50%);
    width:min(400px,84vw);border:1px solid var(--line);border-left:2px solid var(--copper);
    background:rgba(5,9,10,.78);backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);
    padding:12px 14px;font-family:var(--mono);font-size:11.5px;line-height:1.95;color:#c3ccc7;
    letter-spacing:.04em;opacity:0;transition:opacity .55s;pointer-events:none}
  #note.on{opacity:1}
  #note b{display:block;color:var(--copper);font-size:9.5px;letter-spacing:.26em;margin-bottom:6px}""",
"""  /* カルテは紙として出す。半透明の黒板ではなく、黄ばんだ紙にランプの光が
     当たっているように見せる。読ませたい文なので、地の色と行間を本に寄せる。 */
  #note{position:absolute;z-index:3;left:50%;bottom:calc(136px + var(--sab));
    transform:translateX(-50%) rotate(-.5deg);
    width:min(420px,86vw);padding:16px 18px 18px;
    color:#2a2721;font-family:var(--mono);font-size:12px;line-height:2.0;letter-spacing:.03em;
    background:
      linear-gradient(180deg,rgba(255,252,240,.03),transparent 40%),
      radial-gradient(130% 100% at 20% 0%,#e6dfc6,#cfc7ac 60%,#b9b096 100%);
    box-shadow:0 10px 34px rgba(0,0,0,.72), inset 0 0 42px rgba(120,104,70,.28);
    opacity:0;transition:opacity .55s;pointer-events:none;
    /* 紙の縁を不揃いにする。真四角だと UI の板に見える */
    clip-path:polygon(0.6% 0,99.2% .8%,100% 98.6%,.4% 100%)}
  #note.on{opacity:1}
  #note::after{content:'';position:absolute;inset:0;pointer-events:none;
    background:repeating-linear-gradient(0deg,rgba(90,78,52,.055) 0 1px,transparent 1px 3px)}
  #note b{display:block;color:#6b3b3b;font-size:9.5px;letter-spacing:.26em;
    margin-bottom:9px;padding-bottom:7px;border-bottom:1px solid rgba(80,66,44,.34)}""", 'note')

rep("""  .rule{width:min(420px,86vw);height:1px;background:var(--line);margin:22px 0}""",
"""  /* 罫は左右へ薄れる。端まで同じ濃さの直線は、紙よりも枠に見える */
  .rule{width:min(420px,86vw);height:1px;margin:22px 0;
    background:linear-gradient(90deg,transparent,rgba(232,226,212,.26) 22%,rgba(232,226,212,.26) 78%,transparent)}""", 'rule')

rep("""  h1.title{
    font-size:clamp(38px,13vw,86px);font-weight:800;letter-spacing:-.03em;line-height:.86;
    text-transform:uppercase;margin:10px 0 2px;
    text-shadow:0 0 34px rgba(111,191,168,.22);
  }""",
"""  h1.title{
    font-size:clamp(38px,13vw,86px);font-weight:200;letter-spacing:.06em;line-height:.9;
    text-transform:uppercase;margin:10px 0 2px;position:relative;
    text-shadow:0 0 44px rgba(111,191,168,.18);
  }
  /* 題字の上を、消えかけの蛍光灯のように光が横切る */
  h1.title::after{content:'';position:absolute;inset:-6% -4%;pointer-events:none;
    background:linear-gradient(105deg,transparent 42%,rgba(232,226,212,.16) 50%,transparent 58%);
    animation:titleSweep 7.5s linear infinite}
  @keyframes titleSweep{0%{transform:translateX(-120%)}
    55%{transform:translateX(120%)} 100%{transform:translateX(120%)}}""", 'title')

rep("""  .chart{
    width:min(420px,86vw);border:1px solid var(--line);border-radius:2px;padding:12px 14px;margin-bottom:20px;
    font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--dim);line-height:1.9
  }
  .chart b{color:var(--bone);font-weight:500}
  .chart .row{display:flex;justify-content:space-between;gap:12px}""",
"""  /* 入院台帳のような割り付け。枠で囲むのをやめ、項目ごとの細い罫だけにする。
     見出しを左、値を右端で揃え、あいだを点線でつなぐ（目録の作法）。 */
  .chart{
    width:min(420px,86vw);padding:2px 2px 4px;margin-bottom:22px;
    font-family:var(--mono);font-size:10.5px;letter-spacing:.12em;color:var(--dim);line-height:1.9
  }
  .chart b{color:var(--bone);font-weight:400}
  .chart .row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
    padding:7px 2px;border-bottom:1px solid rgba(232,226,212,.09);overflow:hidden}
  .chart .row:last-child{border-bottom:none}
  .chart .row span{position:relative;padding-right:8px;white-space:nowrap}
  .chart .row span::after{content:'';position:absolute;left:100%;bottom:.32em;width:100vw;
    border-bottom:1px dotted rgba(232,226,212,.14)}
  .chart .row b{position:relative;padding-left:8px;z-index:1;text-align:right;
    background:linear-gradient(180deg,#05090a,#070d0f)}""", 'chart')

rep("""function updateHUD(dt, bpm, info){
  if(skipUI) return;
  updateBar('barBat', player.battery/100);""",
"""/* 計器の目覚め。値が動いたとき・危ないとき・拾った直後だけ濃く出す。
   何も起きていない間は沈ませて、暗がりの方を見させる。
   情報を隠すためではなく、変化に注意を向けるための切り替え。 */
var HUDW = { t:0, bat:100, sta:100, hp:100, got:-1 };
function hudWake(sec){ HUDW.t = Math.max(HUDW.t, sec); }

function updateHUD(dt, bpm, info){
  if(skipUI) return;
  // 変化の検出。しきい値はどれも「人が気づく程度」に置く
  if(Math.abs(player.battery - HUDW.bat) > 0.8 ||
     Math.abs(player.stamina - HUDW.sta) > 6 ||
     player.hp !== HUDW.hp) hudWake(2.6);
  if(player.got !== HUDW.got){ hudWake(3.4); HUDW.got = player.got; }
  HUDW.bat = player.battery; HUDW.sta = player.stamina; HUDW.hp = player.hp;
  var danger = (hunter.mode === 'chase') || player.hp < 55 || player.battery < 22 || player.stamina < 25;
  HUDW.t = Math.max(0, HUDW.t - dt);
  var awake = danger || HUDW.t > 0;
  $('vitals').classList.toggle('awake', awake);
  $('objective').classList.toggle('awake', awake);
  $('lowhp').style.opacity = (player.hp >= 70 ? 0 : (1 - player.hp/70) * 0.85).toFixed(3);

  updateBar('barBat', player.battery/100);""", 'updateHUD')

rep("""  world.noteOrder = buildNoteOrder(player.need);   // 読む順はその回ごとに引く""",
"""  world.noteOrder = buildNoteOrder(player.need);   // 読む順はその回ごとに引く
  HUDW.t = 4.0; HUDW.bat = 100; HUDW.sta = 100; HUDW.hp = 100; HUDW.got = -1;""", 'hudw-init')

open(p, 'w').write(s)
print('UI パッチ適用')

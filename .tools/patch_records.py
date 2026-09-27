import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

# --- 記録の保存 --------------------------------------------------------------
rep("""function saveSettings(){""",
"""/* 遊んだ記録。難易度ごとに、挑戦した回数・脱出した回数・最速の脱出・
   無傷で脱出したか、を残す。次に何を狙うかが自分で決められるようになる。
   保存できない環境（プライベートモード等）では黙って諦める——
   記録が残らないだけで遊べなくなるものではない。 */
var RECS = [null, null, null];
function blankRec(){ return { runs:0, wins:0, best:0, noHit:false, most:0 }; }
try{
  var rr = JSON.parse(localStorage.getItem('ward7.recs') || 'null');
  for(var ri2=0; ri2<3; ri2++){
    var r0 = (rr && rr[ri2]) ? rr[ri2] : blankRec();
    RECS[ri2] = {
      runs:  (+r0.runs  || 0), wins: (+r0.wins || 0),
      best:  (+r0.best  || 0), most: (+r0.most || 0),
      noHit: !!r0.noHit
    };
  }
}catch(e){ for(var ri3=0; ri3<3; ri3++) RECS[ri3] = blankRec(); }
function saveRecs(){
  try{ localStorage.setItem('ward7.recs', JSON.stringify(RECS)); }catch(e){}
}
/* 1 回ぶんを記録する。won=脱出したか、hits=被弾回数 */
function recordRun(won, hits){
  if(cheatUsed) return;                       // チートを使った回は残さない
  var R = RECS[clamp(settings.diff|0,0,2)];
  R.runs++;
  if(player.got > R.most) R.most = player.got;
  if(won){
    R.wins++;
    if(!R.best || player.time < R.best) R.best = player.time;
    if(hits === 0) R.noHit = true;
  }
  saveRecs();
}
function recLine(d){
  var R = RECS[d];
  if(!R || !R.runs) return '記録なし';
  return '挑戦 ' + R.runs + ' · 脱出 ' + R.wins +
         (R.best ? ' · 最速 ' + fmtTime(R.best) : '') +
         (R.noHit ? ' · 無傷あり' : '');
}

function saveSettings(){""", 'recs')

# 被弾回数を数える
rep("""    if(!cheats.godmode) player.hp = clamp(player.hp - DIFF[settings.diff].dmg, 0, 100);""",
    """    if(!cheats.godmode) player.hp = clamp(player.hp - DIFF[settings.diff].dmg, 0, 100);
    player.hits = (player.hits || 0) + 1;""", 'hits')
rep("""  player.vx = 0; player.vz = 0;""",
    """  player.vx = 0; player.vz = 0; player.hits = 0;""", 'hits-reset')

# 結果画面。診療記録の体裁に寄せる
rep("""        $('deadStats').innerHTML =
          (playAs === 'hunter' ? '<b style="color:#c04040">捕らえた</b><br>' : '') +
          '経過時間 <b>'+fmtTime(player.time)+'</b><br>' +
          '回収したカルテ <b>'+player.got+' / '+player.need+'</b><br>' +
          '難易度 <b>'+DIFF[settings.diff].key+'</b>' +
          (cheatUsed ? '<br><b style="color:#e8a33d">チート使用</b>' : '');
        showPanel('dead');""",
"""        recordRun(false, player.hits||0);
        $('deadStats').innerHTML = endTable([
          ['経過時間', fmtTime(player.time)],
          ['回収したカルテ', player.got + ' / ' + player.need],
          ['被弾', (player.hits||0) + ' 回'],
          ['難易度', DIFF[settings.diff].key],
          ['これまで', recLine(settings.diff)]
        ]) + (cheatUsed ? '<div class="warnline">チート使用のため記録に残していない</div>' : '');
        showPanel('dead');""", 'dead')

rep("""    $('winStats').innerHTML =
      (playAs === 'hunter' ? '<b style="color:#c04040">逃げられた</b><br>' : '') +
      '脱出タイム <b>'+fmtTime(player.time)+'</b><br>' +
      '残ランプ <b>'+Math.round(player.battery)+'%</b><br>' +
      '難易度 <b>'+DIFF[settings.diff].key+'</b>' +
      (cheatUsed ? '<br><b style="color:#e8a33d">チート使用</b>' : '');
    showPanel('win');""",
"""    var wasBest = !cheatUsed && (!RECS[settings.diff].best || player.time < RECS[settings.diff].best);
    recordRun(true, player.hits||0);
    $('winStats').innerHTML =
      (playAs === 'hunter' ? '<div class="warnline">逃げられた</div>' : '') +
      endTable([
        ['脱出タイム', fmtTime(player.time) + (wasBest ? ' <em>最速</em>' : '')],
        ['被弾', (player.hits||0) + ' 回' + ((player.hits||0) === 0 ? ' <em>無傷</em>' : '')],
        ['残ランプ', Math.round(player.battery) + '%'],
        ['難易度', DIFF[settings.diff].key],
        ['これまで', recLine(settings.diff)]
      ]) + (cheatUsed ? '<div class="warnline">チート使用のため記録に残していない</div>' : '');
    showPanel('win');""", 'win')

# 表の組み方（カルテと同じ作法：見出し左・値右・あいだを点線）
rep("""function fmtTime(s){""",
"""/* 結果は表で出す。カルテの表と同じ作法にして、
   ゲームの中の書類とつながって見えるようにする。 */
function endTable(rows){
  var h = '<div class="endrows">';
  for(var i=0;i<rows.length;i++)
    h += '<div class="row"><span>' + rows[i][0] + '</span><b>' + rows[i][1] + '</b></div>';
  return h + '</div>';
}

function fmtTime(s){""", 'table')

rep("""  .warn{width:min(420px,86vw);""",
"""  .endrows{width:min(420px,86vw);font-family:var(--mono);font-size:11px;letter-spacing:.1em;
    color:var(--dim);margin:2px 0 6px}
  .endrows .row{display:flex;justify-content:space-between;gap:12px;align-items:baseline;
    padding:9px 2px;border-bottom:1px solid rgba(232,226,212,.09);overflow:hidden}
  .endrows .row:last-child{border-bottom:none}
  .endrows .row span{position:relative;padding-right:8px;white-space:nowrap}
  .endrows .row span::after{content:'';position:absolute;left:100%;bottom:.32em;width:100vw;
    border-bottom:1px dotted rgba(232,226,212,.14)}
  .endrows .row b{position:relative;padding-left:8px;z-index:1;color:var(--bone);font-weight:400;
    background:linear-gradient(180deg,#05090a,#070d0f);text-align:right}
  .endrows em{font-style:normal;color:var(--amber);font-size:9.5px;letter-spacing:.2em;margin-left:8px}
  .warnline{width:min(420px,86vw);font-family:var(--mono);font-size:10px;letter-spacing:.18em;
    color:var(--amber);margin:10px 0 2px;text-align:center}
  .warn{width:min(420px,86vw);""", 'endcss')

# タイトルに記録を出す
rep("""      <div class="row"><span>警告</span><b style="color:#8c2626">病棟内に別の何かがいる</b></div>""",
"""      <div class="row"><span>警告</span><b style="color:#8c2626">病棟内に別の何かがいる</b></div>
      <div class="row"><span>記録</span><b id="chartRec">記録なし</b></div>""", 'title-rec')

rep("""function syncSettingsUI(){
  syncQualityHint();""",
"""function syncSettingsUI(){
  syncQualityHint();
  var cr = $('chartRec');
  if(cr) cr.textContent = recLine(clamp(settings.diff|0,0,2));""", 'sync-rec')
open(p,'w').write(s)
print('記録と結果画面のパッチ適用')

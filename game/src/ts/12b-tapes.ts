/* --- 録音テープ（設計指示書 第 11.5 節・第 20.1 節「録音テープ 7 本」） ---------------
   院長が口述で残した記録。章ごとに 1 本、その回に拾った最初のカルテの代わりに出る
   （まだ聴いていない章だけ。私信と同じく、チートの回・自動操作・追う側では出さない）。
   案 A（移送されなかった患者たち）の側から、所見・私信と同じ出来事を語る。

   声は .tools/voice-bake.js が下の台詞から作る（Open JTalk の合成音声をカセットの音へ加工）。
   台詞を直したら焼き直すこと。区切りの時刻は assets.js の voice/tapes に入り、字幕はそれに合わせて送る。
   声が無いとき（低品質・assets.js がまだ）は、台詞を全部まとめて紙と同じように読ませる。
   下の配列は焼く道具が文字列として読むので、式を書かずに文字列の並びだけにしておく */
var TAPES = [
  ['昭和六十二年四月二日', [
    '記録。第七病棟の夜間巡回について。',
    '当直の看護婦から、患者が夜中に廊下を歩き回ると報告があった。',
    '本人たちに記憶は無い。夢遊の類いだろう。経過を見る。',
    '念のため、夜間は非常灯のほかを落とすよう指示した。'
  ]],
  ['昭和六十二年四月十日', [
    '東棟の大部屋で、四名が同じ夢を訴えている。',
    '長い髪の女が、枕元に立つのだそうだ。',
    '灯りを向けると、患者たちは叫ぶ。暗いままにしておけば、静かにしている。',
    '暗いままにしておく。'
  ]],
  ['昭和六十二年五月一日', [
    '七名が同時に発症した。',
    '全員が、同じ方角を向いて座っている。地下の方角だ。',
    '非常回路の配線を調べさせた。図面に無い線が一本ある。',
    '誰が引いたのか分からない。工事の書類には、私の印が押してある。'
  ]],
  ['昭和六十二年五月十四日', [
    '夜勤の看護婦が、患者に名前を呼ばれたと言ってきた。',
    '去年亡くした、妹さんの声だったそうだ。',
    '休ませるべきだと分かっている。だが、彼女がいないと夜の記録が残らない。',
    '天井の上を、何かが這っている。録音を止める。'
  ]],
  ['昭和六十二年五月二十八日', [
    '記録の持ち出しを禁じた。',
    '外へ出した記録は、翌朝には必ずここへ戻っている。棚の、同じ場所に。',
    '書架の間に、誰かが立っている。照らすと、いない。',
    '私は、照らし続けることにした。'
  ]],
  ['昭和六十二年六月二日', [
    '閉鎖を決めた。移送の車は、手配しなかった。',
    '患者たちは、自分から地下へ降りていった。水の中を、一列に並んで。',
    'あの線は、そこへ伸びている。繋がれている、と言ったほうが正しい。',
    '記録の上では、全員を移送したことにする。'
  ]],
  ['昭和六十二年六月十一日', [
    'これが最後の記録になる。',
    '当直の看護婦が、まだ病棟から出てこない。',
    '呼んでも返事がない。代わりに、妹さんの声が返ってくる。',
    '非常口の場所を、誰も思い出せない。私もだ。',
    'これを聴いているあなたの名前も、ここのカルテにある。'
  ]]
];
var TAPE_SLOT = 0;                      // 何枚目のカルテ（0 始まり）の代わりに出すか
var TAPE_SPEAKER = '院長';
var TAPE = { i:-1, t:0, dur:0, line:-1, node:(null as any), times:(null as any) };

function tapeWanted(i: number){
  return i === TAPE_SLOT && RUN.ch >= 0 && RUN.ch < TAPES.length && !cheatUsed && !BOT.on &&
         playAs !== 'hunter' && !JOURNAL.tapes[RUN.ch];
}
/* 区切りの時刻（焼いたときの実測）。無ければ null */
function tapeTimes(ti: number){
  var A = window.W7_ASSETS;
  if(!A || !A['voice/tapes']) return null;
  try{ var all = JSON.parse(A['voice/tapes']); return all[ti] || null; }catch(e){ return null; }
}
function tapeHead(ti: number){ return '録音テープ ' + (ti + 1) + ' — ' + TAPES[ti][0]; }
function playTape(ti: number){
  stopTape();
  JOURNAL.tapes[ti] = 1; saveJournal();
  var lines = TAPES[ti][1] as string[];
  TAPE.i = ti; TAPE.t = 0; TAPE.line = -1;
  TAPE.times = tapeTimes(ti);
  $('noteHead').textContent = tapeHead(ti);
  $('note').classList.add('on', 'tape');
  if(TAPE.times && Audio2.voice('voice/tape_' + (ti + 1), function(node: any){ TAPE.node = node; })){
    TAPE.dur = TAPE.times[TAPE.times.length - 1][1] + 1.2;
    $('noteBody').textContent = '';
    noteT = TAPE.dur + 1.5;
  }else{
    // 声が無い：書き起こしを紙と同じように読ませる
    TAPE.i = -1;
    $('noteBody').textContent = lines.map(function(l){ return trText(TAPE_SPEAKER) + (LANG === 'en' ? ': ' : '：') + trText(l); }).join('\n');
    noteT = 6 + lines.length * 2.2;
  }
}
function stopTape(){
  if(TAPE.node){ try{ TAPE.node.stop(); }catch(e){} TAPE.node = null; }
  TAPE.i = -1;
  $('note').classList.remove('tape');
}
/* 字幕を送る。音と同じ時計（AudioContext）で数えると一時停止で自然に止まるが、
   声の再生が始まるまでの遅れ（decode）は無視できるほど短いので、ゲームの時間で数える */
function updateTape(dt: number){
  if(TAPE.i < 0) return;
  if(!TAPE.node){ return; }              // 解き終わるのを待つ
  TAPE.t += dt;
  var lines = TAPES[TAPE.i][1] as string[], cur = -1;
  for(var k=0; k<TAPE.times.length; k++) if(TAPE.t >= TAPE.times[k][0] - 0.05) cur = k;
  if(cur !== TAPE.line){
    TAPE.line = cur;
    $('noteBody').textContent = cur >= 0 ? trText(TAPE_SPEAKER) + (LANG === 'en' ? ': ' : '：') + trText(lines[cur]) : '';
  }
  if(TAPE.t > TAPE.dur){ TAPE.node = null; TAPE.i = -1; }
}

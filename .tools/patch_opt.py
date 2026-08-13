import sys
p = sys.argv[1] if len(sys.argv) > 1 else '/home/user/ward7/ward7.html'
s = open(p).read()
def rep(old,new,tag):
    global s
    assert old in s, tag
    s = s.replace(old,new,1)

rep("""  .field{width:min(420px,86vw);margin-top:18px}""",
"""  .field{width:min(420px,86vw);margin-top:18px}
  /* 設定は「何が変わるのか」まで書く。名前だけでは選べない */
  .field .hint{font-family:var(--mono);font-size:9.5px;letter-spacing:.1em;line-height:1.8;
    color:#6f7b78;margin-top:7px}
  .field .hint b{color:var(--copper);font-weight:400}
  /* 節の見出し。設定が一列に並んでいるだけだと目が滑る */
  .sect{width:min(420px,86vw);margin:30px 0 -4px;display:flex;align-items:center;gap:12px;
    font-family:var(--mono);font-size:9.5px;letter-spacing:.34em;color:var(--dim);text-transform:uppercase}
  .sect::after{content:'';flex:1;height:1px;
    background:linear-gradient(90deg,rgba(232,226,212,.20),transparent)}""", 'css')

rep("""  <div class="field">
    <label>描画品質 <span id="valQ">自動</span></label>
    <div class="seg" id="segQ" role="group" aria-label="描画品質">
      <button type="button" data-q="0" aria-pressed="false">軽量</button>
      <button type="button" data-q="1" aria-pressed="true">標準</button>
      <button type="button" data-q="2" aria-pressed="false">高精細</button>
      <button type="button" data-q="3" aria-pressed="false">最高</button>
    </div>
  </div>""",
"""  <div class="sect">画面</div>
  <div class="field">
    <label>描画品質 <span id="valQ">自動</span></label>
    <div class="seg" id="segQ" role="group" aria-label="描画品質">
      <button type="button" data-q="0" aria-pressed="false">軽量</button>
      <button type="button" data-q="1" aria-pressed="true">標準</button>
      <button type="button" data-q="2" aria-pressed="false">高精細</button>
      <button type="button" data-q="3" aria-pressed="false">最高</button>
    </div>
    <div class="hint" id="hintQ"></div>
  </div>""", 'html-q')

rep("""  <div class="field">
    <label for="sens">視点感度 <span id="valS">1.0</span></label>""",
"""  <div class="sect">操作</div>
  <div class="field">
    <label for="sens">視点感度 <span id="valS">1.0</span></label>""", 'html-sens')

rep("""  <div class="field">
    <label for="vol">音量 <span id="valV">70</span></label>""",
"""  <div class="sect">音</div>
  <div class="field">
    <label for="vol">音量 <span id="valV">70</span></label>""", 'html-vol')

rep("""function syncSettingsUI(){""",
"""/* 品質の段ごとに「何が入るか」。名前だけでは何が変わるのか分からないし、
   端末に合うものを選ぶ手がかりが無い。実際に効く項目をそのまま並べる。 */
var QDESC = [
  ['軽量',   'テクスチャ 128 · 什器 24 · 画面効果なし', '古い端末向け。動作を最優先'],
  ['標準',   'テクスチャ 256 · 什器 44 · 画面効果あり', '既定。多くの端末でなめらか'],
  ['高精細', 'テクスチャ 512 · 什器 44 · <b>残響 · 埃 · 非常口の光</b>', '音の反響と空気が出る'],
  ['最高',   'テクスチャ 1024 · 什器 70 · <b>影 · 光の滲み · 追加の造形</b>', '新しい端末向け']
];
function syncQualityHint(){
  var q = clamp(settings.quality|0, 0, 3), d = QDESC[q];
  var el = $('hintQ');
  if(el) el.innerHTML = d[1] + '<br>' + d[2];
}

function syncSettingsUI(){
  syncQualityHint();""", 'js')
open(p,'w').write(s)
print('設定画面のパッチ適用')

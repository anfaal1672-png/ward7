/* =========================================================================
   1b. 言語（設計指示書 第 14 章）
   =========================================================================
   画面に出る文字はすべて日本語で書いてあり、呼び出し口は数百ある。
   それを一つずつ T() で包むと、書き換えのたびに漏れが出る。
   そこで「画面に出た文字」の側で訳す。英語を選んでいるときだけ、
   文書に文字が入った瞬間（MutationObserver）に辞書で置き換える。

   訳し方は 3 段：
     1) 文がまるごと辞書にあればそれ（カルテ・私信・結末・画面の文言）
     2) 数字を含む決まった形は型で（「カルテ 3 / 5」など）
     3) それでも残った日本語は、知っている語を長いものから順に置き換える
        （組み立てた文の部品。語順は崩れるが意味は通る）
   日本語が 1 文字も無い文字列には触らない（数字だけの表示を何度も訳さない）。 */
var LANG = 'ja';
(function(){
  var saved = null;
  try{ saved = JSON.parse(Store.get('ward7.settings') || 'null'); }catch(e){}
  if(saved && (saved.lang === 'ja' || saved.lang === 'en')) LANG = saved.lang;
  else LANG = /^ja\b/i.test(navigator.language || 'ja') ? 'ja' : 'en';
})();
var JP_RE = /[぀-ヿ一-鿿　-〿！-～]/;

var EN = {
  // --- タイトル・パネル ---
  'WARD 7 — 第七病棟':'WARD 7', '第七病棟':'Ward Seven',
  '患者':'Patient', 'あなた':'You', '所持品':'Carrying', '手回し式ランプ 1':'1 hand-crank lamp',
  '逃げ場':'Refuge', 'ロッカー・ベッドの下':'Lockers · under beds', '目的':'Objective',
  '警告':'Warning', '病棟内に別の何かがいる':'Something else is in the ward', '記録':'Record',
  '記録なし':'No record', '病棟に入る':'Enter the ward', '設定':'Settings', 'チート':'Cheats', 'アシスト':'Assist',
  'AIにプレイさせる':'Let the AI play', '手帳':'Notebook', '追う側で遊ぶ':'Play as the hunter',
  '音量を上げるとよく聞こえます。ヘッドホン推奨。':'Turn the volume up. Headphones recommended.',
  '静穏':'Calm', '通常':'Normal', '絶望':'Despair',
  '一 西棟':'I West', '二 東棟':'II East', '三 管理棟':'III Admin', '四 階段':'IV Stairs',
  '五 記録庫':'V Archive', '六 地下':'VI Basement', '七 第七病棟':'VII Ward 7', '夜勤':'Night shift',
  '西棟':'West Wing', '東棟':'East Wing', '管理棟':'Admin Block', '階段':'Stairwell', '記録庫':'Archive',
  '地下':'Basement',
  'カルテを集め、非常口から出る。':'Collect the patient records and leave by the emergency exit.',
  '大部屋の患者たちは壁を向いて立っている。灯りを向けると騒ぐ。騒げば、あれが来る。':
    'The patients in the long ward stand facing the walls. Shine a light on them and they scream. If they scream, it comes.',
  '非常回路が落ちている。電源を戻さなければ非常口は開かない。戻せば、あれに気づかれる。':
    'The emergency circuit is dead. The exit will not open until the power is back. Restore it, and it will know.',
  '天井裏を何かが這っている。音のした方へ、上から先回りしてくる。':
    'Something is crawling in the ceiling. It gets ahead of you from above, toward any sound.',
  '灯りの外でだけ近づいてくるものがいる。照らせば止まり、照らし続ければ消える。':
    'Something here only moves outside the light. Light it and it stops. Keep it lit and it is gone.',
  '地下は膝まで水が溜まっている。水の中では自分の足音が響き、あれの足音は水音に紛れる。':
    'The basement is knee-deep in water. Your steps carry. Its steps drown in the sound of water.',
  '最初の病棟に戻ってきた。出口の場所を思い出す。ここを抜けたところで、すべてが終わる。':
    'You are back in the first ward. Remember where the exit is. It all ends past that door.',
  '毎回違う病棟。物語とは別に、何度でも。':'A different ward every time. Apart from the story, as often as you like.',
  '（抜けた）':'(cleared)',
  // --- 設定 ---
  '画面':'Display', '描画品質':'Graphics quality', '自動':'Auto', '軽量':'Light', '標準':'Standard',
  '高精細':'High', '最高':'Ultra', '探知モード':'Detection', 'オフ':'Off', 'オン':'On', '敵のみ':'Enemy only',
  '完全':'Full', '画面の明るさ':'Brightness',
  'いちばん左の四角が「かろうじて見える」ところに合わせる。 本編と同じ計算で描いているので、ここで見えない暗さは病棟でも見えない。':
    'Adjust until the leftmost square is barely visible. It is drawn exactly like the game, so what you cannot see here you will not see in the ward.',
  '見え方と酔い・光過敏':'Comfort · motion · photosensitivity', '視野角':'Field of view', '画面の揺れ':'Camera motion',
  '歩いたときの頭の揺れ、被弾の揺れ、画面の歪み。酔いやすい人は下げる。':
    'Head bob, hit shake and screen distortion. Lower it if you get motion sick.',
  '点滅の強さ':'Flicker',
  '蛍光灯とランプのちらつき。光の点滅が苦手な人は 0 にする（明かりは点いたまま揺れなくなる）。':
    'Flicker of lamps and fluorescent tubes. Set to 0 if flashing light bothers you (lights stay on, steady).',
  '音の方向表示':'Sound direction cues',
  '追跡者の足音と声が、どちらから聞こえたかを画面の縁に出す。音が聞き取りにくい環境でも遊べる。':
    'Shows at the screen edge where the hunter’s steps and voice came from. Playable where sound is hard to hear.',
  '操作':'Controls', '視点感度':'Look sensitivity', '音':'Audio', '音量':'Volume', 'Y軸反転':'Invert Y', '戻る':'Back',
  '言語':'Language',
  'テクスチャ 128 · 什器 24 · 画面効果なし':'Textures 128 · props 24 · no post effects',
  '古い端末向け。動作を最優先':'For older devices. Smoothness first',
  'テクスチャ 256 · 什器 44 · 画面効果あり':'Textures 256 · props 44 · post effects',
  '既定。多くの端末でなめらか':'Default. Smooth on most devices',
  'テクスチャ 512 · 什器 44 · ':'Textures 512 · props 44 · ', '残響 · 埃 · 非常口の光':'reverb · dust · exit glow',
  '音の反響と空気が出る':'Adds echo and air',
  'テクスチャ 1024 · 什器 70 · ':'Textures 1024 · props 70 · ', '影 · 光の滲み · 追加の造形':'shadows · bloom · extra detail',
  '新しい端末向け':'For recent devices',
  '有効にすると記録に「チート使用」と残ります。':'Records will be marked as “cheats used”.', '有効にすると記録に「アシスト使用」と残ります。':'Records will be marked as “assist used”.',
  '効果はすぐ反映され、次回起動時も保持されます。':'Takes effect immediately and is kept next time.',
  // --- 一時停止・結果 ---
  '一時停止':'Paused', '続ける':'Resume', '病棟から出る（タイトルへ）':'Leave the ward (title)',
  '死亡確認':'Deceased', 'タイトルへ':'Title', 'もう一度':'Again', '脱出':'Escaped', '退院':'Discharged',
  '経過時間':'Time', '鍵':'Key', '所持':'held', '未所持':'not held', '被弾':'Caught', '難易度':'Difficulty',
  '脱出タイム':'Escape time', '残ランプ':'Lamp left', 'これまで':'So far', '回収したカルテ':'Records recovered',
  'チート使用のため記録に残していない':'Not recorded: cheats were used', 'アシスト使用のため記録に残していない':'Not recorded: assist was used', '逃げられた':'It got away',
  '捕らえた':'Caught', '奪われたカルテ':'Records taken',
  // --- 手帳 ---
  '所見 — 夜勤の看護記録':'Observations — night-shift nursing notes',
  '書き置き — 患者の残したもの':'Notes — left by patients',
  '通達・記録 — 院長名義':'Notices — in the director’s name',
  '私信 — 同じ筆跡で':'Letters — in the same hand',
  '（未読）':'(unread)',
  '三通の私信は、同じ一人の声を追っていた。最後の扉の前で、灯りを消す。':
    'Three of the letters follow the same voice. At the last door, put out the light.',
  '私信を読み比べ、同じことを語っている三通を選ぶ。':'Compare the letters. Choose the three that speak of the same thing.',
  '私信はまだ揃っていない。一度の脱出行で一通ずつ見つかる。':'The letters are not complete yet. One turns up on each escape.',
  // --- 遊んでいる間 ---
  'カルテを探せ':'Find the records', '病棟内のカルテを回収せよ':'Recover the records in the ward',
  '非常口へ走れ':'Run for the exit', '鍵を探して非常口へ':'Find the key, then the exit',
  '電源を戻し、非常口へ':'Restore the power, then the exit',
  'カルテを全回収した':'All records recovered', '非常口が開いた':'The emergency exit is open',
  '何かが、こちらへ向かっている':'Something is coming this way',
  'ランプを満タンにした':'Lamp fully charged', '扉が開いた':'The door opened', '電源が入った':'Power restored',
  '電源を切った':'Power cut', '見られた':'It saw you', 'ロッカーに隠れた':'Hiding in the locker',
  '机の下に潜り込んだ':'Under the desk', 'ベッドの下に潜り込んだ':'Under the bed', '見つかった':'Found',
  '息が切れた':'Out of breath', 'ランプが消えた':'The lamp went out', '電池切れ':'Battery dead',
  '描画品質を下げました':'Graphics quality lowered', '描画が中断されました':'Rendering interrupted',
  '描画を復帰しました':'Rendering restored', '描画の復帰を待っています':'Waiting for rendering to recover',
  '左で移動（大きく倒すと走る）':'Move with the left side (push far to run)',
  'WASD で移動 · Shift で走る':'WASD to move · Shift to run',
  '掴まれた — 次はもう振りほどけない':'Grabbed — next time you will not break free',
  '冷たい指が触れた':'Cold fingers touched you', '次で終わり':'next is the end',
  'LAMP':'LAMP', '拾う':'Take', '隠れる':'Hide', '潜る':'Crawl in', '出る':'Leave', '切る':'Off', '入れる':'On',
  '開ける':'Open', '施錠':'Locked', '停電':'No power', '投げる':'Throw', '後ろを':'Look', '見る':'back',
  '息を':'Hold', '止める':'breath', '忍び足':'Sneak',
  '足音':'footsteps', '走る足音':'running steps', '声':'voice', '叫び声':'scream', '天井裏':'ceiling', '囁き':'whisper',
  '前の方':'ahead', '右手の方':'to your right', '後ろの方':'behind you', '左手の方':'to your left',
  '見えている。逃がすな':'You see it. Don’t let it go', '近い。音がした方へ':'Close. Toward the sound',
  '獲物を探せ':'Find your prey', 'カルテを揃えた。もう隠れられない':'All records taken. It can’t hide now',
  '気配':'Presence', '起動できません':'Cannot start', '再読み込み':'Reload',
  '歩いた場所の地図':'Map of where you have walked',
  'プレイテスト':'Playtest', '記録を書き出す':'Export log', '記録をクリップボードに写した':'Log copied to clipboard',
  'どこで捕まったか・どの章で何分かかったか・動作の重さを、この端末の中だけに残す。外へは送らない。':
    'Keeps where you were caught, how long each chapter took and how heavy the game ran, on this device only. Nothing is sent anywhere.',
  '恐怖の調整':'Fear settings', '隠れ場所は安全':'Hiding spots are safe', '驚かしを弱める':'Softer scares', '左手持ち':'Left-handed',
  'あれが隠れ場所を点検せず、入るところを見られても引き出されない。':'It never checks hiding spots, and won\u2019t pull you out even if it saw you go in.',
  '叫び声や金切り声、急に鳴る音を小さくする。捕まったときの演出は「画面の揺れ」で弱められる。':'Quieter screams and sudden stings. Tone down the capture scene with \u201cCamera motion\u201d.',
  '移動のスティックを右半分に、ボタンを左側に移す。':'Moves the stick to the right half and the buttons to the left.',
  '日替わりの病棟。今日の夜勤は、今日だけ。':'A different ward each day. Tonight\u2019s shift is only tonight.',
  '振動':'Vibration', '心拍・近づく足音・掴まれた瞬間を手に伝える（iOS アプリ）。':'Feel your heartbeat, approaching footsteps and being grabbed (iOS app).',
  'ボタンの配置を編集':'Edit button layout', '画面のボタンを指で好きな所へ動かす。':'Drag the on-screen buttons wherever you like.',
  'ボタンを指で動かす':'Drag the buttons', '元に戻す':'Reset', '完了':'Done',
  'キーの割り当て':'Key bindings', '既定に戻す':'Reset to defaults', 'キーを押す…':'Press a key…',
  '前へ':'Forward', '後ろへ':'Back', '左へ':'Left', '右へ':'Right', '走る・息を止める':'Run / hold breath',
  '使う・隠れる':'Use / hide', 'ランプ':'Lamp', '瓶を投げる':'Throw bottle', '振り返る':'Look back',
  '押した操作のボタンを選び、割り当てるキーを押す（Esc で取りやめ）。矢印キーなどの控えは、主キーと重ならない限り残る。':
    'Pick an action, then press the key to bind (Esc cancels). Backup keys such as the arrows stay unless they clash with a main key.',
  '画面効果':'Effects', '光の筋':'Light shafts', '接地の陰':'Contact shadows', '輪郭を均す':'Anti-aliasing', '読む間の背景ぼかし':'Blur while reading',
  'ランプの光が空気中の埃に散って、筋として見える。高精細以上。':'Your lamp\u2019s light scatters in the dust and shows as a beam. High and above.',
  '物が床や壁に接する所に落ちる柔らかい陰。最高品質のみ。':'Soft shadows where objects meet floors and walls. Ultra only.',
  '細い線（配管・格子・手すり）のぎざぎざとちらつきを抑える。標準以上。':'Smooths jagged, shimmering thin lines (pipes, grilles, rails). Standard and above.',
  '書類を読んでいる間、奥の景色を少しぼかす。追われている間はぼかさない。':'Slightly blurs the background while you read a document. Never while being chased.',
  '覗く':'Peek', '扉を押し開けた — 音が響いた':'Shoved the door open \u2014 it echoed', '扉をそっと開けている…':'Easing the door open\u2026',
  '立体音響':'3D audio', 'ヘッドホン':'Headphones', 'スピーカー':'Speakers',
  'ヘッドホンでは前後の違いまで聞き分けられる。本体のスピーカーでは左右だけにした方が自然に聞こえる。':
    'With headphones you can tell front from back. On the built-in speaker, left/right only sounds more natural.',
  'クレジット':'Credits', 'ゲーム':'Game', '描画':'Rendering', '壁の素材':'Wall texture', '床の素材':'Floor texture',
  '天井の素材':'Ceiling texture', 'すべて WebAudio で合成':'All synthesized with WebAudio', '足音・割れる音・金属音':'Footsteps, breaking glass, metal', '小道具の模型':'Prop models', 'Metal Office Desk・Wall Clock・Fire Extinguisher・Medical Box・Metal Stool — Poly Haven（CC0）を加工':'Metal Office Desk, Wall Clock, Fire Extinguisher, Medical Box, Metal Stool — Poly Haven (CC0), processed', 'Impact Sounds — Kenney（CC0）を加工':'Impact Sounds — Kenney (CC0), processed', 'その他の音':'Other sounds', '空調・水・ポンプの持続音':'Air handling, water and pump loops', '30 CC0 SFX Loops — rubberduck（CC0）を加工':'30 CC0 SFX Loops — rubberduck (CC0), processed', 'WebAudio で合成':'Synthesized with WebAudio',
  '写真素材は病院と 1987 年に合わせて色と汚れを加工して使っている。':'Photo textures were recolored and weathered to fit a 1987 hospital.',

  // --- カルテ ---
  '夜間、第七病棟の患者が廊下を歩き回る。制止しても反応がない。翌朝は全員、何も覚えていないと言う。':
    'At night the Ward 7 patients walk the corridors. They do not respond when stopped. In the morning, every one of them says they remember nothing.',
  '同室の四名が同じ夢を訴えた。長い髪の女が枕元に立ち、こちらを覗き込んでいる、と。':
    'Four patients in one room report the same dream. A woman with long hair stands by the pillow, looking down at them.',
  '夜勤中、階段の踊り場で足音を聞いた。上でも下でもなく、同じ場所で足踏みをしている音だった。':
    'On night duty I heard footsteps on the landing. Not above, not below. Something marking time in one place.',
  '第七病棟の消灯後、非常灯だけが点いている。電源は落としてあるはずだ。配線図を取り寄せた。':
    'After lights-out in Ward 7, only the emergency lamps stay lit. The power should be off. I have sent for the wiring plans.',
  '配線記録':'Wiring record',
  '第七病棟の非常回路は本館と切り離されている。図面には無い線が一本、地下へ伸びている。':
    'The Ward 7 emergency circuit is separate from the main building. One line not on any plan runs down into the basement.',
  '七名が同時に発症。共通する所見はない。全員が同じ方向を向いて座っている。':
    'Seven onsets at once. No common findings. All of them sit facing the same direction.',
  '書き置き':'Note',
  'ここの明かりは、点けると見つかる。消すと歩けない。どちらかを選べということらしい。':
    'Turn the light on here and you are found. Turn it off and you cannot walk. It seems you are meant to choose.',
  '患者の一人が私の名を呼んだ。名札は外している。声は、私が去年亡くした妹のものだった。':
    'One of the patients called my name. I had taken off my name tag. The voice was my sister’s. I lost her last year.',
  '彼女の病室から鍵を回収した。中には誰もいない。ベッドの窪みはまだ温かかった。':
    'I recovered a key from her room. No one was inside. The hollow in the bed was still warm.',
  'ロッカーの中は安全だ。ただし入るところを見られてはいけない。見られたら、扉は開けられる。':
    'Inside a locker you are safe. Just do not be seen getting in. If it sees you, the door gets opened.',
  '同じ患者を三度収容した。三度とも別の病室から現れた。移動の経路が説明できない。':
    'We have admitted the same patient three times. Each time from a different room. The route cannot be explained.',
  '同僚が三人辞めた。理由を訊いても誰も口をきかない。私も明日で辞める。':
    'Three colleagues have quit. None of them will say why. I am quitting tomorrow.',
  '通達 05-28':'Notice 05-28', '通達 06-05':'Notice 06-05',
  '第七病棟における記録の持ち出しを禁ずる。カルテは全て院内に留め置くこと。院長':
    'Records may not be removed from Ward 7. All charts are to remain in the hospital. — The Director',
  '走れば逃げられる。あれは思ったより遅い。ただし、こちらが息を切らすまでの話だ。':
    'You can outrun it. It is slower than you think. Only until you run out of breath.',
  '院長より第七病棟の閉鎖を通達。患者の移送記録は、どこにも残っていない。':
    'The Director has ordered Ward 7 closed. There is no record anywhere of the patients being transferred.',
  '第七病棟を封鎖する。以後の立ち入りを禁ずる。当該病棟に関する問い合わせには応じない。':
    'Ward 7 is sealed. Entry is forbidden. No inquiries about the ward will be answered.',
  '扉には鍵がかかっている。鍵は誰かが持ち出した。持ち出した誰かも、まだこの中にいる。':
    'The door is locked. Someone took the key. Whoever took it is still in here.',
  'まだここにいる。出口の場所が思い出せない。これを読んでいる人へ——ランプを消しなさい。':
    'I am still here. I cannot remember where the exit is. To whoever reads this — put out your lamp.',
  // --- 私信 ---
  '美和へ。今日から夜勤に入る。第七病棟は静かなところだと聞いていた。静かなのは、誰も口をきかないからだった。':
    'Miwa — I start nights today. They told me Ward 7 was quiet. It is quiet because no one speaks.',
  '美和へ。あなたの三回忌の日取りが決まったと母から電話があった。行けそうにない。ここを離れると、何かが私の代わりに廊下を歩く気がする。':
    'Miwa — Mother called; the date for your memorial is set. I don’t think I can go. If I leave, I feel something will walk these corridors in my place.',
  '美和へ。病棟で、あなたの鼻歌を聞いた。小さい頃に私が歌ってあげた子守唄。窓の外ではなく、壁の中から。':
    'Miwa — I heard you humming on the ward. The lullaby I used to sing you when you were small. Not outside the window. Inside the wall.',
  '美和へ。手回しのランプを借りた。回している間だけ灯る。回している間、音がする。音がすると、あれが来る。':
    'Miwa — I borrowed a hand-crank lamp. It only lights while I wind it. Winding it makes a sound. When there is a sound, it comes.',
  '美和へ。夜中にあなたが私の名前を呼んだ。振り向かなかった。振り向いたら、あなたではないと分かってしまうから。':
    'Miwa — In the night you called my name. I did not turn around. If I turned, I would know it wasn’t you.',
  '美和へ。記録を持ち出すなと言われた。だから、ここに残していく。誰かが拾ったら、それが私だったと分かるように。':
    'Miwa — I was told not to take the records out. So I am leaving them here. So that whoever finds them knows it was me.',
  '美和へ。暗いところは怖くないと、あなたは言っていた。灯りを消せば、向こうからは見えない。灯りを消せば、やっとこちらからも見える。':
    'Miwa — You used to say the dark wasn’t frightening. Put out the light and it cannot see you. Put out the light and, at last, you can see it too.',
  // --- 結末 ---
  '非常口の扉を押し開けた。外ではなかった。':'I pushed the exit door open. It was not outside.',
  '第七病棟の入口に立っていた。受付の上に、カルテの束が置いてある。':'I was standing at the entrance to Ward 7. On the front desk lay a stack of charts.',
  'いちばん上の一枚の患者名の欄に、あなたの名前が書いてある。':'On the top one, in the space for the patient’s name, is your name.',
  'ランプを消した。暗闇の中で、呼ぶ声がすぐそこまで来て、止まった。':'I put out the lamp. In the dark, the voice that was calling came right up to me, and stopped.',
  '「お姉ちゃん」':'“Sis.”',
  '手を伸ばすと、冷たい指が触れた。怖くはなかった。':'I reached out. Cold fingers touched mine. I was not afraid.',
  '所見 06-11 追記　第七病棟、最後の患者の退院を確認。記録者 不明。':'Observation 06-11, addendum. Discharge of the last Ward 7 patient confirmed. Recorded by: unknown.',
  // --- チート（画面の文言） ---
  '無敵（ダメージ無効）':'God mode (no damage)', 'ランプ無限':'Infinite lamp', 'スタミナ無限':'Infinite stamina',
  '正気度が減らない':'Sanity never drops', '体力が自動で回復する':'Health regenerates', '追跡者に見つからない':'Invisible to the hunter',
  '足音を立てない':'Silent footsteps', 'ランプの光で見つからない':'Lamp light doesn’t give you away',
  'どこでも隠れられる（入る所を見られても）':'Hiding always works (even if seen)', '移動速度 2倍':'Double speed', '壁抜け':'No clip',
  '拾う・使うが即時':'Instant interact', '追跡者を停止':'Freeze the hunter', '追跡者の速度を半分に':'Hunter at half speed',
  '追跡者がすぐ見失う':'Hunter forgets quickly', '追跡者が攻撃してこない':'Hunter never attacks',
  '終盤でも居場所が漏れない':'Not tracked in the endgame', '常に完全探知':'Always full detection',
  'カルテ・鍵・電池が壁越しに光る':'Records, key and batteries glow through walls', '隠れ場所が壁越しに光る':'Hiding spots glow through walls',
  '病棟全体が明るい':'Bright ward', '視野を広げる':'Wide view', 'スローモーション':'Slow motion',
  '画面の揺れと歪みを止める':'No shake or distortion', '内部の値を表示':'Show internals', 'カルテを全回収':'Collect all records',
  '体力とランプを全回復':'Restore health and lamp', '非常口へワープ':'Warp to the exit', '追跡者を引き離す':'Push the hunter away',
  '鍵を手に入れる':'Get the key', '施錠扉を開ける':'Open the locked door', '追跡者を 10 秒止める':'Stop the hunter for 10 s',
  '追跡者を遠くへ飛ばす':'Send the hunter far away', '電池を全部集める':'Collect all batteries',
  '地図を全部知る（AI観戦用）':'Reveal the map (AI spectator)', '即座に脱出する':'Escape now', '即座に力尽きる':'Die now',
  '自分':'You', '見つからない':'Stealth', '動き':'Movement', '追跡者':'Hunter', '見え方':'Vision', 'その他':'Other',
  'プレイ中のみ使えます':'Only during play', 'AI観戦モードでのみ使えます':'Only in AI spectator mode',
  '鍵を手に入れた':'Got the key', '施錠扉を開けた':'Opened the locked door', '開ける扉がない':'No door to open',
  '追跡者を止めた':'Hunter stopped', '電池を全部集めた':'Collected all batteries', '地図を全部知った':'Map revealed',
  '脱出した':'Escaped', '力尽きた':'Died', '全回復した':'Fully restored', '非常口へ移動した':'Moved to the exit',
  '追跡者を引き離した':'Hunter pushed away', '適用中…':'Applying…', 'この端末に合わせて画質を調整しています…':'Tuning graphics for this device…',
  // --- 操作説明（一時停止）。<br> で行が分かれて届くので行ごとに ---
  '左半分でドラッグ＝移動（大きく倒すと走る）':'Drag the left half = move (push far to run)',
  '右半分でドラッグ＝視点　LAMP＝ランプ　拾う＝回収':'Drag the right half = look · LAMP = lamp · Take = pick up',
  '後ろを見る＝長押しで振り返る（走りながら可）':'Look back = hold to turn around (works while running)',
  '隠れている間は「息を止める」で気配を消せる':'While hiding, \u201cHold breath\u201d hides your presence',
  'WASD＝移動　マウス＝視点　Shift＝走る':'WASD = move · Mouse = look · Shift = run',
  'F＝ランプ　E＝回収／隠れる　Q＝後ろを見る':'F = lamp · E = take / hide · Q = look back · G = throw · Ctrl = sneak',
  'Esc＝一時停止　隠れている間は Shift で息を止める':'Esc = pause · While hiding, Shift holds your breath',
  '左半分でドラッグ＝移動（大きく倒すと突進）':'Drag the left half = move (push far to charge)',
  '右半分でドラッグ＝視点':'Drag the right half = look',
  '触れれば殴る。殴った直後は自分も固まる':'Touch it to strike. You freeze for a moment after',
  '相手はこちらより速い。曲がり角で待て':'It is faster than you. Wait at corners',
  'WASD＝移動　マウス＝視点　Shift＝突進':'WASD = move · Mouse = look · Shift = charge'
};
/* 数字の入る決まった形 */
var EN_PATTERNS = [
  [/^カルテ (\d+) \/ (\d+)$/, 'Records $1 / $2'],
  [/^カルテ(\d+)枚 → 非常口$/, '$1 records → exit'],
  [/^第(\d+)章　(.+)$/, function(m, n, name){ return 'Chapter ' + n + ' — ' + trText(name); }],
  [/^第(\d+)章 (.+?)　(.*)$/, function(m, n, name, rest){ return 'Chapter ' + n + ' ' + trText(name) + ' — ' + trText(rest); }],
  [/^第(\d+)章 完$/, 'Chapter $1 complete'],
  [/^次の章へ　第(\d+)章 (.+)$/, function(m, n, name){ return 'Next: Chapter ' + n + ' ' + trText(name); }],
  [/^あと (\d+) 回$/, '$1 left'],
  [/^掴まれた — 振りほどいた（あと (\d+) 回）$/, 'Grabbed — broke free ($1 left)'],
  [/^冷たい指が触れた（あと (\d+) 回）$/, 'Cold fingers touched you ($1 left)'],
  [/^包帯を巻いた — あと (\d+) 回振りほどける$/, 'Bandaged — you can break free $1 more times'],
  [/^瓶を拾った（(\d+)）— 投げると音で気を引ける$/, 'Picked up a bottle ($1) — throw it to draw it away'],
  [/^(カルテ|鍵|非常口)は区画 ([A-J]) のあたりにあった気がする(?:。(.+))?$/, function(m, what, z, dir){
      return 'The ' + ({'カルテ':'records','鍵':'key','非常口':'exit'})[what] + ' seemed to be around zone ' + z + (dir ? ', ' + trText(dir) : ''); }],
  [/^［(.+?)・(前|右|後ろ|左)(?:・(近い|遠い))?］$/, function(m, what, dir, far){
      return '[' + trText(what) + ' · ' + ({'前':'ahead','右':'right','後ろ':'behind','左':'left'})[dir] +
             (far ? ' · ' + (far === '近い' ? 'near' : 'far') : '') + ']'; }],
  [/^カルテを (\d+) 枚 集めろ$/, 'Collect $1 records'],
  [/^挑戦 (\d+)/, function(m){ return trFragments(m); }],
  [/^（いま (\d+) 件）$/, '($1 entries)'],
  [/^(\d+) 回$/, '$1']
];
/* 部品の置き換え（長いものから） */
var EN_FRAG = [
  ['読んだ記録 ', 'Read '], ['　私信 ', '  Letters '], ['　· 脱出の結末を見た', ' · saw the escape ending'],
  ['　· もう一つの結末を見た', ' · saw the other ending'], ['　— 結びついた', ' — linked'],
  ['挑戦 ', 'Runs '], [' · 脱出 ', ' · escapes '], [' · 最速 ', ' · best '], [' · 無傷あり', ' · unhurt run'],
  ['所見 ', 'Observation '], ['私信 一', 'Letter I'], ['私信 二', 'Letter II'], ['私信 三', 'Letter III'],
  ['私信 四', 'Letter IV'], ['私信 五', 'Letter V'], ['私信 六', 'Letter VI'], ['私信 七', 'Letter VII'],
  ['通達 ', 'Notice '], ['追跡者を飛ばした（', 'Hunter sent away ('], ['m 先）', ' m)'],
  ['最速', 'best'], ['無傷', 'unhurt'], [' 回', ''], ['区画', 'zone'], ['章', 'ch.'],
  ['所見', 'Observation'], ['私信', 'Letter'], ['カルテ', 'records'], ['非常口', 'exit']
];
function trFragments(s){
  for(var i=0; i<EN_FRAG.length; i++) if(s.indexOf(EN_FRAG[i][0]) >= 0) s = s.split(EN_FRAG[i][0]).join(EN_FRAG[i][1]);
  return s;
}
function trText(s){
  if(LANG !== 'en' || !s || !JP_RE.test(s)) return s;
  var lead = s.match(/^\s*/)[0], tail = s.match(/\s*$/)[0], core = s.trim();
  if(EN.hasOwnProperty(core)) return lead + EN[core] + tail;
  var norm = core.replace(/\s+/g, ' ');
  if(EN.hasOwnProperty(norm)) return lead + EN[norm] + tail;
  for(var i=0; i<EN_PATTERNS.length; i++){
    var P = EN_PATTERNS[i];
    if(P[0].test(core)) return lead + core.replace(P[0], P[1]) + tail;
  }
  // 改行を含む文（結末）は行ごとに
  if(core.indexOf('\n') >= 0) return lead + core.split('\n').map(function(l){ return trText(l); }).join('\n') + tail;
  return lead + trFragments(core) + tail;
}
function trNode(root){
  if(LANG !== 'en' || !root) return;
  if(root.nodeType === 3){ var t = trText(root.data); if(t !== root.data) root.data = t; return; }
  if(root.nodeType !== 1 || root.tagName === 'SCRIPT' || root.tagName === 'STYLE') return;
  ['aria-label', 'title', 'placeholder'].forEach(function(a){
    var v = root.getAttribute && root.getAttribute(a);
    if(v && JP_RE.test(v)) root.setAttribute(a, trText(v));
  });
  for(var c = root.firstChild; c; c = c.nextSibling) trNode(c);
}
if(LANG === 'en'){
  document.documentElement.lang = 'en';
  document.title = 'WARD 7';
  trNode(document.body);
  try{
    new MutationObserver(function(list){
      for(var i=0; i<list.length; i++){
        var m = list[i];
        if(m.type === 'characterData') trNode(m.target);
        else for(var k=0; k<m.addedNodes.length; k++) trNode(m.addedNodes[k]);
      }
    }).observe(document.body, { subtree:true, childList:true, characterData:true });
  }catch(e){}
}

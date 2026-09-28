# 外部素材の出所とライセンス

設計指示書 第 7.2 節の決まり：素材ごとに出所・ライセンス・加工の有無を 1 行ずつ記録する。
ここに無い素材はコミットしない（`node game/build.mjs --check` が落とす）。

| 素材（assets/ 以下） | 出所 | 作者 | ライセンス | 加工 |
|---|---|---|---|---|
| textures/wall_tile/ | Poly Haven「Long White Tiles」 https://polyhaven.com/a/long_white_tiles | Poly Haven | CC0 1.0 | 彩度を半分に落とし青緑へ寄せた。染みと垂れの汚れ層を重ね、粗さを汚れに合わせて上げた。1024px・JPEG で詰め直し（`.tools/asset-bake.js`） |
| textures/floor_lino/ | Poly Haven「Old Linoleum Flooring 01」 https://polyhaven.com/a/old_linoleum_flooring_01 | Poly Haven | CC0 1.0 | 彩度を落とし黄土へ寄せた。染みと擦れ（台車の轍・靴跡）を重ねた。1024px |
| textures/ceiling/ | Poly Haven「Ceiling Interior」 https://polyhaven.com/a/ceiling_interior | Poly Haven | CC0 1.0 | 彩度を落とし灰緑へ寄せた。染みを重ねた。512px |
| sfx/（step_hard_*・step_soft_*・glass_*・metal_*・plate_*） | Kenney「Impact Sounds」 https://kenney.nl/assets/impact-sounds （footstep_concrete / footstep_carpet / impactGlass_heavy / impactMetal_heavy / impactPlate_heavy） | Kenney | CC0 1.0 | 22.05kHz・モノラルへ落とし、頭と尾の無音を切り、ピークを -1dB に揃えた。足音は 3.2kHz より上を 7dB 寝かせた（リノリウムと靴底の鈍さ）。16bit WAV（`.tools/sound-bake.js`）。鳴らすときに速さ・高さを毎回ずらし、追跡者の足音は低く引き下げて使う |
| models/desk/ | Poly Haven「Metal Office Desk」 https://polyhaven.com/a/metal_office_desk | Poly Haven | CC0 1.0 | 以下 models/ は共通：glTF の節点の変換を掛けて材質ごとに 1 つへまとめ、位置と UV を 16bit・法線を 8bit に詰めた。色の絵は 512px に落として彩度を 3 割抜き、病棟の色へ寄せた。法線・粗さの絵は持たない（`.tools/model-bake.js`） |
| models/clock/ | Poly Haven「Wall Clock」 https://polyhaven.com/a/wall_clock | Poly Haven | CC0 1.0 | 同上。硝子は薄い透明の膜として描く |
| models/extinguisher/ | Poly Haven「Korean Fire Extinguisher 01」 https://polyhaven.com/a/korean_fire_extinguisher_01 | Poly Haven | CC0 1.0 | 同上 |
| models/medbox/ | Poly Haven「Medical Box」 https://polyhaven.com/a/medical_box | Poly Haven | CC0 1.0 | 同上 |
| models/stool/ | Poly Haven「Metal Stool 01」 https://polyhaven.com/a/metal_stool_01 | Poly Haven | CC0 1.0 | 同上 |
| sfx/（amb_hvac_0・amb_air_0・amb_pump_0・amb_water_0） | OpenGameArt「30 CC0 SFX Loops」 https://opengameart.org/content/30-cc0-sfx-loops （ambient_01 / noise_01 / pump_02 / water_flowing） | rubberduck | CC0 1.0 | 22.05kHz・モノラルへ落とし、尻の 0.4 秒を頭へ重ねて継ぎ目の無い輪にした。ピーク -6dB。16bit WAV（`.tools/sound-bake.js`）。空調の持続音・通気口のかすれ・地下の水音とポンプとして低く敷く |
| models/hunter/ | MakeHuman 基本の体・形の差分・既定の骨格と重み https://github.com/makehumancommunity/makehuman （makehuman/data の 3dobjs/base.obj・targets・rigs、コミット a8bc2d5） | Data Collection AB・Joel Palmius・Jonas Hauquier | CC0 1.0 | 年寄りで痩せた背の高い男の形の差分を掛け、追跡者の骨格の寸法へ引き伸ばした（腕 2.5 倍・胴 1.6 倍）。163 本の骨を 20 本へ畳み、三角形 2 万 / 8 千 / 2 千の 3 段へ減らした。病衣は胴と腰の面を浮かせ、補助の筒（helper-skirt）を膝上で切って作った。位置・UV 16bit、法線・重み 8bit（`.tools/human-bake.py`） |
| models/hand/ | MakeHuman（models/hunter/ と同じ出所・コミット） | Data Collection AB・Joel Palmius・Jonas Hauquier | CC0 1.0 | 痩せた若い大人の手の形の差分を掛け、右の前腕と手を切り出して、指の節ごとにランプの胴（半径 2.45cm）の表面まで曲げて握らせた。手首は小指側へ倒した。包帯・患者用バンド・爪は同じ皮膚の面を浮かせて作った（`.tools/hand-bake.py`） |
| voice/（tape_1〜7.mp3・tapes.json） | 台詞はこのゲームの書き下ろし。声は Open JTalk（Modified BSD） http://open-jtalk.sourceforge.net/ の合成に、HTS voice「nitech_jp_atr503_m001」 | 名古屋工業大学 国際音声技術研究所・東京工業大学（声の模型） | CC BY 3.0 https://creativecommons.org/licenses/by/3.0/ （声の模型） | 読み上げた声に、テープの揺れ・帯域の制限・飽和・初期反射・ヒス・音の落ち込み・再生と停止の音を加えた。22.05kHz・40kbps の MP3（`.tools/voice-bake.js`）。クレジット画面に作者と CC BY 3.0 を表示する |

CC0 なので帰属表示の義務は無いが、クレジット画面には出所として載せる。

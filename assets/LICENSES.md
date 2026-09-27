# 外部素材の出所とライセンス

設計指示書 第 7.2 節の決まり：素材ごとに出所・ライセンス・加工の有無を 1 行ずつ記録する。
ここに無い素材はコミットしない（`node game/build.mjs --check` が落とす）。

| 素材（assets/ 以下） | 出所 | 作者 | ライセンス | 加工 |
|---|---|---|---|---|
| textures/wall_tile/ | Poly Haven「Long White Tiles」 https://polyhaven.com/a/long_white_tiles | Poly Haven | CC0 1.0 | 彩度を半分に落とし青緑へ寄せた。染みと垂れの汚れ層を重ね、粗さを汚れに合わせて上げた。1024px・JPEG で詰め直し（`.tools/asset-bake.js`） |
| textures/floor_lino/ | Poly Haven「Old Linoleum Flooring 01」 https://polyhaven.com/a/old_linoleum_flooring_01 | Poly Haven | CC0 1.0 | 彩度を落とし黄土へ寄せた。染みと擦れ（台車の轍・靴跡）を重ねた。1024px |
| textures/ceiling/ | Poly Haven「Ceiling Interior」 https://polyhaven.com/a/ceiling_interior | Poly Haven | CC0 1.0 | 彩度を落とし灰緑へ寄せた。染みを重ねた。512px |

CC0 なので帰属表示の義務は無いが、クレジット画面には出所として載せる。

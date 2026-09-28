# WARD 7 — iOS 包装

ゲーム本体は `../ward7.html` 一枚。ここはそれを全画面の `WKWebView` に
読ませる入れ物。Safari では届かない端末の機能を 3 つだけ橋渡しする。

| | |
|---|---|
| 音 | `AVAudioSession` を playback に。消音スイッチが入っていても鳴る |
| 振動 | ゲーム側の `haptic()` が `ward7haptic` へ投げたものを Taptic Engine で鳴らす（Safari の iPhone は `navigator.vibrate` を持たない） |
| 画面 | 遊んでいる間は自動で消灯・施錠しない |

## .ipa の作り方

GitHub Actions の **iOS ipa** を実行する（`workflow_dispatch`、または
`ward7.html` / `ios/` を触った push で自動）。成果物は artifact
`Ward7-unsigned-ipa` に入る。

**署名はしていない**（`CODE_SIGNING_ALLOWED=NO`）。証明書もプロビジョニング
プロファイルも要らない。

## 手元の Mac で作る場合

```sh
brew install xcodegen
cd ios
cp ../ward7.html ../three.min.js Resources/
python3 make_icon.py Resources/Assets.xcassets/AppIcon.appiconset
xcodegen generate
xcodebuild -project Ward7.xcodeproj -scheme Ward7 -configuration Release \
  -sdk iphoneos -derivedDataPath build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" build
mkdir -p Payload && cp -R build/Build/Products/Release-iphoneos/Ward7.app Payload/
zip -qry Ward7-unsigned.ipa Payload
```

## 中身

| | |
|---|---|
| `Sources/AppDelegate.swift` | 全画面 WebView。慣性スクロール・ゴムバンド・ピンチ拡大を止める。音・振動・画面の橋渡し |
| `project.yml` | XcodeGen の設定。`pbxproj` は手書きせず生成する |
| `make_icon.py` | アイコンを手続きで描く。画像ファイルを置かないため |
| `Resources/` | ビルド時に `ward7.html`・`three.min.js`・アイコンが入る（リポジトリには置かない） |

`ward7.html` とアイコンは CI が用意するので、リポジトリには画像も HTML の
複製も置いていない。「外部アセット 0」というゲーム側の方針を包装でも崩さない。

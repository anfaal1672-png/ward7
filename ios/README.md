# WARD 7 — iOS 包装

ゲーム本体は `../ward7.html` 一枚。ここはそれを全画面の `WKWebView` に
読ませるだけの入れ物で、ゲーム側のコードには手を入れていない。

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
cp ../ward7.html Resources/ward7.html
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
| `Sources/AppDelegate.swift` | 全画面 WebView。慣性スクロール・ゴムバンド・ピンチ拡大を止める |
| `project.yml` | XcodeGen の設定。`pbxproj` は手書きせず生成する |
| `make_icon.py` | アイコンを手続きで描く。画像ファイルを置かないため |
| `Resources/` | ビルド時に `ward7.html` とアイコンが入る（リポジトリには置かない） |

`ward7.html` とアイコンは CI が用意するので、リポジトリには画像も HTML の
複製も置いていない。「外部アセット 0」というゲーム側の方針を包装でも崩さない。

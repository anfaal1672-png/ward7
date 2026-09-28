//  WARD 7 — iOS 包装
//
//  ゲーム本体は ward7.html 一枚で完結している。ここがやるのは
//  「全画面の WKWebView に読ませて、ブラウザらしい振る舞いを全部止める」
//  ことに加えて、Safari では届かない端末の機能を 3 つだけ橋渡しする。
//    - 音：消音スイッチが入っていても鳴らす（AVAudioSession を playback に）
//    - 振動：ゲーム側の haptic() が ward7haptic へ投げたものを Taptic Engine で鳴らす
//    - 画面：遊んでいる間に自動で消灯・施錠しない
//    - 熱：端末の温度の段階をゲームへ渡す（内部解像度の上限を下げる。第 8.3 節）

import UIKit
import WebKit
import AVFoundation

@UIApplicationMain
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // 既定（soloAmbient）だと消音スイッチで WebAudio ごと黙る。
        // ホラーは音が半分なので、音楽アプリと同じ扱いにする。
        // mixWithOthers は付けない：他のアプリの音楽が重なると台無しになる。
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        try? AVAudioSession.sharedInstance().setActive(true)
        // 暗い廊下で息を殺している間に画面が消えると、そのまま施錠される
        application.isIdleTimerDisabled = true
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = GameViewController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}

final class GameViewController: UIViewController, WKNavigationDelegate, WKScriptMessageHandler {

    private var webView: WKWebView!
    private let heavy = UIImpactFeedbackGenerator(style: .heavy)

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.02, green: 0.035, blue: 0.04, alpha: 1)  // --void

        let cfg = WKWebViewConfiguration()
        // WebAudio と全画面。iOS は音の開始に指のタップを要求するが、
        // ゲーム側がタイトル画面のタップで Audio2.resume() を呼んでいる。
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.suppressesIncrementalRendering = false
        // 振動の橋渡し。ゲーム側の haptic() がこれを見つけると vibrate の代わりに使う
        cfg.userContentController.add(self, name: "ward7haptic")

        webView = WKWebView(frame: .zero, configuration: cfg)
        webView.navigationDelegate = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // ブラウザらしい振る舞いを止める：慣性スクロール・ゴムバンド・
        // ピンチ拡大・上端の引き下げ。どれもゲーム中に起きると操作が崩れる。
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        webView.scrollView.bouncesZoom = false
        webView.scrollView.pinchGestureRecognizer?.isEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { webView.isInspectable = true }

        webView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        NSLayoutConstraint.activate([
            webView.topAnchor.constraint(equalTo: view.topAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            webView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: view.trailingAnchor)
        ])

        guard let url = Bundle.main.url(forResource: "ward7", withExtension: "html") else {
            showFailure("ward7.html が入っていない")
            return
        }
        webView.loadFileURL(url, allowingReadAccessTo: url.deletingLastPathComponent())
        NotificationCenter.default.addObserver(self, selector: #selector(thermalChanged),
            name: ProcessInfo.thermalStateDidChangeNotification, object: nil)
    }

    /// 端末の温度の段階（0 nominal … 3 critical）をゲームへ渡す。
    /// 熱で急にコマ落ちする前に、ゲーム側が内部解像度の上限を下げる。
    @objc private func thermalChanged() {
        let n: Int
        switch ProcessInfo.processInfo.thermalState {
        case .nominal: n = 0
        case .fair: n = 1
        case .serious: n = 2
        case .critical: n = 3
        @unknown default: n = 1
        }
        DispatchQueue.main.async { [weak self] in
            self?.webView.evaluateJavaScript("window.__w7thermal && window.__w7thermal(\(n))", completionHandler: nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        thermalChanged()                  // 起動時点の温度も渡す
    }

    /// haptic(pat) の pat は ms の数、または [鳴る, 休む, 鳴る, ...]（navigator.vibrate と同じ形）。
    /// Taptic Engine は長さを持たないので、長さを強さに読み替えて 1 打ずつ鳴らす
    /// （12ms の走り出しは軽く、200ms の死亡は最も重く）。
    func userContentController(_ userContentController: WKUserContentController,
                               didReceive message: WKScriptMessage) {
        guard message.name == "ward7haptic" else { return }
        var pattern: [Double] = []
        if let n = message.body as? NSNumber { pattern = [n.doubleValue] }
        else if let a = message.body as? [NSNumber] { pattern = a.map { $0.doubleValue } }
        var at = 0.0
        for (i, ms) in pattern.prefix(16).enumerated() {
            if i % 2 == 0 {
                let strength = CGFloat(min(1.0, max(0.25, ms / 200.0)))
                DispatchQueue.main.asyncAfter(deadline: .now() + at) { [weak self] in
                    self?.heavy.impactOccurred(intensity: strength)
                }
            }
            at += ms / 1000.0
        }
        heavy.prepare()
    }

    // 画面の縁まで使う。safe-area はゲーム側の CSS が env() で見ている
    override var prefersStatusBarHidden: Bool { true }
    override var prefersHomeIndicatorAutoHidden: Bool { true }
    override var preferredScreenEdgesDeferringSystemGestures: UIRectEdge { .all }
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .allButUpsideDown }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showFailure(error.localizedDescription)
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showFailure(error.localizedDescription)
    }

    /// 読み込みに失敗したときに黙って黒画面にしない（原因が分からなくなる）
    private func showFailure(_ msg: String) {
        let label = UILabel()
        label.text = "起動に失敗しました\n\(msg)"
        label.numberOfLines = 0
        label.textAlignment = .center
        label.textColor = UIColor(red: 0.91, green: 0.89, blue: 0.83, alpha: 1)
        label.font = .monospacedSystemFont(ofSize: 13, weight: .regular)
        label.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(label)
        NSLayoutConstraint.activate([
            label.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            label.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            label.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.8)
        ])
    }
}

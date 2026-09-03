//  WARD 7 — iOS 包装
//
//  ゲーム本体は ward7.html 一枚で完結している。ここがやるのは
//  「全画面の WKWebView に読ませて、ブラウザらしい振る舞いを全部止める」
//  ことだけ。ゲーム側のコードには一切手を入れない。

import UIKit
import WebKit

@UIApplicationMain
final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        let w = UIWindow(frame: UIScreen.main.bounds)
        w.rootViewController = GameViewController()
        w.makeKeyAndVisible()
        window = w
        return true
    }
}

final class GameViewController: UIViewController, WKNavigationDelegate {

    private var webView: WKWebView!

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 0.02, green: 0.035, blue: 0.04, alpha: 1)  // --void

        let cfg = WKWebViewConfiguration()
        // WebAudio と全画面。iOS は音の開始に指のタップを要求するが、
        // ゲーム側がタイトル画面のタップで Audio2.resume() を呼んでいる。
        cfg.allowsInlineMediaPlayback = true
        cfg.mediaTypesRequiringUserActionForPlayback = []
        cfg.suppressesIncrementalRendering = false

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

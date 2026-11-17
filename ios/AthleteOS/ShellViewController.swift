import SafariServices
import UIKit
import WebKit

/// The whole app: one web view on the AthleteOS site, plus the native pieces a bare WKWebView lacks
/// (pull to refresh, an offline screen, downloads, JavaScript dialogs, opening other sites in Safari).
final class ShellViewController: UIViewController {
    private let home: URL
    private var webView: WKWebView!
    private let offline = OfflineView()
    private var retryURL: URL?
    private var downloads: [WKDownload: URL] = [:]

    private var theme = PageTheme.dark {
        didSet { applyTheme() }
    }

    init(home: URL) {
        self.home = home
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var preferredStatusBarStyle: UIStatusBarStyle { theme.statusBar }

    override func viewDidLoad() {
        super.viewDidLoad()

        let config = WKWebViewConfiguration()
        // The persistent store keeps the session cookie, so sign-in (and a trusted device) survives
        // relaunches like it does in Safari.
        config.websiteDataStore = .default()
        config.allowsInlineMediaPlayback = true
        // Replacing applicationNameForUserAgent drops WebKit's own "Mobile/…" token, which sites use to
        // tell an iPhone from an iPad, so it is put back. The web app checks for AthleteOSApp/ to hide
        // advice that only applies to Safari (Add to Home Screen, web push).
        config.applicationNameForUserAgent = "Mobile/15E148 AthleteOSApp/\(AppConfig.version)"
        config.userContentController.addUserScript(
            WKUserScript(source: Self.themeObserver, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController.add(WeakMessageHandler(self), name: "theme")

        webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        // The page sets viewport-fit=cover and pads its bottom tab bar with env(safe-area-inset-bottom),
        // so the web view runs under the home indicator and must not add its own inset on top.
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        if #available(iOS 16.4, *) { webView.isInspectable = true }
        #endif

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        offline.isHidden = true
        offline.onRetry = { [weak self] in self?.retry() }

        webView.translatesAutoresizingMaskIntoConstraints = false
        offline.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(webView)
        view.addSubview(offline)
        let safe = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            // The page does not pad for the status bar or a landscape notch, so the web view starts
            // below them; the strip above takes the page colour (applyTheme).
            webView.topAnchor.constraint(equalTo: safe.topAnchor),
            webView.leadingAnchor.constraint(equalTo: safe.leadingAnchor),
            webView.trailingAnchor.constraint(equalTo: safe.trailingAnchor),
            webView.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            offline.topAnchor.constraint(equalTo: view.topAnchor),
            offline.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            offline.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            offline.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])

        applyTheme()
        webView.load(URLRequest(url: home))
    }

    // MARK: - Actions

    @objc private func pullToRefresh() {
        if webView.url == nil { webView.load(URLRequest(url: home)) } else { webView.reload() }
    }

    private func retry() {
        offline.isHidden = true
        webView.load(URLRequest(url: retryURL ?? home))
    }

    private func applyTheme() {
        view.backgroundColor = theme.background
        webView?.backgroundColor = theme.background
        webView?.scrollView.backgroundColor = theme.background
        webView?.scrollView.refreshControl?.tintColor = theme.ink
        offline.apply(theme)
        setNeedsStatusBarAppearanceUpdate()
    }

    private func isHome(_ url: URL) -> Bool {
        url.scheme?.lowercased() == "https" && url.host?.lowercased() == home.host?.lowercased()
    }

    /// Other sites open over the app in a Safari sheet; other schemes (mailto:, tel:) go to their app.
    private func openExternally(_ url: URL) {
        guard let scheme = url.scheme?.lowercased(), scheme == "https" || scheme == "http" else {
            UIApplication.shared.open(url)
            return
        }
        present(SFSafariViewController(url: url), animated: true)
    }

    private func showLoadError(_ error: Error) {
        webView.scrollView.refreshControl?.endRefreshing()
        let ns = error as NSError
        // A load replaced by another (a quick second tap) or turned into a download is not a failure.
        if ns.domain == NSURLErrorDomain && ns.code == NSURLErrorCancelled { return }
        if ns.domain == "WebKitErrorDomain" && ns.code == 102 { return } // frame load interrupted
        retryURL = (ns.userInfo[NSURLErrorFailingURLErrorKey] as? URL) ?? webView.url
        offline.isHidden = false
    }

    private func share(_ file: URL) {
        let sheet = UIActivityViewController(activityItems: [file], applicationActivities: nil)
        sheet.popoverPresentationController?.sourceView = view
        present(sheet, animated: true)
    }

    // Sets data-theme on <html> from its cookie and flips it in place, so the native strip above the
    // page follows it without a navigation.
    private static let themeObserver = """
    (function () {
      var root = document.documentElement;
      function post() { window.webkit.messageHandlers.theme.postMessage(root.getAttribute("data-theme") || "dark"); }
      post();
      new MutationObserver(post).observe(root, { attributes: true, attributeFilter: ["data-theme"] });
    })();
    """
}

// MARK: - Navigation

extension ShellViewController: WKNavigationDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url, let scheme = url.scheme?.lowercased() else {
            return decisionHandler(.cancel)
        }
        if action.shouldPerformDownload { return decisionHandler(.download) }
        switch scheme {
        case "https", "http":
            // A tapped link to another site opens in Safari. Navigations the page makes itself stay
            // here: connecting Garmin or Oura sends the web view to the provider's sign-in, which then
            // redirects back to Settings → Connected accounts.
            if action.navigationType == .linkActivated, action.targetFrame?.isMainFrame == true, !isHome(url) {
                openExternally(url)
                return decisionHandler(.cancel)
            }
            decisionHandler(.allow)
        case "about", "blob", "data":
            decisionHandler(.allow)
        default:
            openExternally(url)
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse,
                 decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        // Exports (questionnaire JSON, series CSV) are sent as attachments; save and offer them in the
        // share sheet rather than showing raw text.
        if let http = response.response as? HTTPURLResponse,
           let disposition = http.value(forHTTPHeaderField: "Content-Disposition"),
           disposition.lowercased().hasPrefix("attachment") {
            return decisionHandler(.download)
        }
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) {
        download.delegate = self
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        webView.scrollView.refreshControl?.endRefreshing()
        offline.isHidden = true
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        showLoadError(error)
    }

    // iOS reclaims a background web view's process under memory pressure; without a reload the app
    // comes back to a blank page.
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        webView.reload()
    }
}

// MARK: - Windows and dialogs

extension ShellViewController: WKUIDelegate {
    // target="_blank": the reference links on Readiness and the phone-app install link.
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url {
            if isHome(url) { webView.load(action.request) } else { openExternally(url) }
        }
        return nil
    }

    // WKWebView shows no alert, confirm or prompt unless the app draws them; without these a
    // confirm() would silently answer false.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
            completionHandler(alert?.textFields?.first?.text)
        })
        present(alert, animated: true)
    }
}

// MARK: - Downloads

extension ShellViewController: WKDownloadDelegate {
    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String,
                  completionHandler: @escaping (URL?) -> Void) {
        // A fresh folder per download keeps the server's file name without clashing with an earlier one.
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        } catch {
            return completionHandler(nil)
        }
        let file = dir.appendingPathComponent(suggestedFilename)
        downloads[download] = file
        completionHandler(file)
    }

    func downloadDidFinish(_ download: WKDownload) {
        guard let file = downloads.removeValue(forKey: download) else { return }
        share(file)
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        downloads.removeValue(forKey: download)
        let alert = UIAlertController(title: "The download didn't finish",
                                      message: "\(error.localizedDescription) Try it again from the same page.",
                                      preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

// MARK: - Theme messages

extension ShellViewController: WKScriptMessageHandler {
    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        // Only the AthleteOS page may set the colours; a provider's sign-in page runs the same script.
        let origin = message.frameInfo.securityOrigin
        guard message.frameInfo.isMainFrame, origin.`protocol` == "https",
              origin.host.lowercased() == home.host?.lowercased(),
              let value = message.body as? String, let next = PageTheme(rawValue: value) else { return }
        if next != theme { theme = next }
    }
}

/// WKUserContentController holds its handlers strongly; this breaks the cycle back to the controller.
private final class WeakMessageHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

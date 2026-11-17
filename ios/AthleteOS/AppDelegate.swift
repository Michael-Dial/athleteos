import UIKit

@main
final class AppDelegate: UIResponder, UIApplicationDelegate {}

final class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }
        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = ShellViewController(home: AppConfig.homeURL)
        window.makeKeyAndVisible()
        self.window = window
    }
}

enum AppConfig {
    /// The AthleteOS server, from the ATHLETEOS_URL build setting (ios/project.yml) via Info.plist.
    static let homeURL: URL = {
        let raw = Bundle.main.object(forInfoDictionaryKey: "AthleteOSBaseURL") as? String ?? ""
        guard let url = URL(string: raw), url.scheme == "https", url.host != nil else {
            preconditionFailure("AthleteOSBaseURL must be an https URL; set ATHLETEOS_URL in ios/project.yml")
        }
        return url
    }()

    static var version: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
    }
}

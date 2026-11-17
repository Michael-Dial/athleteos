import AthleteKit
import OpenWearablesHealthSDK
import SwiftUI
import UIKit

@main
struct AthleteOSApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var model = AppModel.live()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
                .tint(Palette.accentText)
                // Invite links (athleteos://invite/CODE). OAuth returns are caught by the web
                // authentication session before they reach here.
                .onOpenURL { model.open($0) }
        }
    }
}

/// OW's SDK registers its background tasks when first touched, which iOS
/// requires before launch finishes, and hands its background upload session
/// back through the app delegate. A launch with no UI (a HealthKit wake)
/// never reaches `reconcile`, so the phone's own bound session resumes here.
final class AppDelegate: NSObject, UIApplicationDelegate {
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        _ = OpenWearablesHealthSDK.shared
        MainActor.assumeIsolated {
            _ = PhoneSync(sdk: OWHealthSDK(), store: StoredBinding(storage: Keychain())).restoreAtLaunch()
        }
        return true
    }

    func application(_ application: UIApplication, handleEventsForBackgroundURLSession identifier: String, completionHandler: @escaping () -> Void) {
        OpenWearablesHealthSDK.setBackgroundCompletionHandler(completionHandler)
    }
}

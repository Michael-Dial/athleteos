// AthleteKit's `HealthSDK` over OW's iOS SDK (Michael-Dial/open_wearables_ios_sdk,
// pinned in project.yml). The rules are in AthleteKit's PhoneSync; this only
// translates. Same adapter as the HPC Validation Hub's.

import AthleteKit
import OpenWearablesHealthSDK
import UIKit

@MainActor
final class OWHealthSDK: HealthSDK {
    private let ow = OpenWearablesHealthSDK.shared
    private var configured = false

    /// Called when the SDK's own token refresh fails; the app then asks AthleteOS for a new pair.
    var onAuthError: (@MainActor () -> Void)? {
        didSet {
            let handler = onAuthError
            ow.onAuthError = { _, _ in Task { @MainActor in handler?() } }
        }
    }

    var isTablet: Bool { UIDevice.current.userInterfaceIdiom == .pad }

    func configure(host: String) {
        ow.configure(host: host)
        configured = true
    }

    /// Stop and sign-out may run before `configure` on a launch; the SDK keeps the host it last had.
    private func ensureConfigured() {
        guard !configured else { return }
        if let host = ow.getStoredCredentials()["host"] as? String { ow.configure(host: host) }
        configured = true
    }

    func storedUserId() -> String? { ow.getStoredCredentials()["userId"] as? String }
    func restoreAtLaunch() { ow.restoreBackgroundSyncAtLaunch() }
    func isSessionValid() -> Bool { ow.isSessionValid }
    func isSyncActive() -> Bool { ow.isSyncActive }

    func signIn(owUserId: String, accessToken: String, refreshToken: String) async throws {
        ow.signIn(userId: owUserId, accessToken: accessToken, refreshToken: refreshToken, apiKey: nil)
    }

    func updateTokens(accessToken: String, refreshToken: String) {
        ow.updateTokens(accessToken: accessToken, refreshToken: refreshToken)
    }

    func signOut() async throws {
        ensureConfigured()
        ow.signOut()
    }

    /// Every type is mapped or the start is refused: a type that silently never syncs looks exactly like a device that was not worn.
    func requestAuthorization(types: [String]) async throws -> Bool {
        let mapped = try types.map { name in
            guard let t = HealthDataType(rawValue: name) else {
                throw SyncError("This version of the app asks Apple Health for a measure (\(name)) its Health library doesn't know, so sync wasn't started. Update the app.")
            }
            return t
        }
        return await withCheckedContinuation { done in
            ow.requestAuthorization(types: mapped) { done.resume(returning: $0) }
        }
    }

    func startBackgroundSync(daysBack: Int) async throws -> Bool {
        await withCheckedContinuation { done in
            ow.startBackgroundSync(syncDaysBack: daysBack) { done.resume(returning: $0) }
        }
    }

    func stopBackgroundSync() async throws {
        ensureConfigured()
        ow.stopBackgroundSync()
    }

    func resetAnchors() {
        ensureConfigured()
        ow.resetAnchors()
    }
}

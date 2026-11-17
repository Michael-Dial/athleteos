import Foundation
import Testing
@testable import AthleteKit

@MainActor
final class FakeSDK: HealthSDK {
    var isTablet = false
    var host: String?
    var userId: String?
    var tokens: (String, String)?
    var active = false
    var startResult = true
    var calls: [String] = []

    func configure(host: String) { self.host = host; calls.append("configure") }
    func storedUserId() -> String? { userId }
    func isSessionValid() -> Bool { userId != nil }
    func isSyncActive() -> Bool { active }
    func signIn(owUserId: String, accessToken: String, refreshToken: String) async throws { userId = owUserId; tokens = (accessToken, refreshToken); calls.append("signIn") }
    func updateTokens(accessToken: String, refreshToken: String) { tokens = (accessToken, refreshToken); calls.append("updateTokens") }
    func signOut() async throws { userId = nil; tokens = nil; calls.append("signOut") }
    func requestAuthorization(types: [String]) async throws -> Bool { calls.append("authorize"); return true }
    func startBackgroundSync(daysBack: Int) async throws -> Bool { active = startResult; calls.append("start(\(daysBack))"); return startResult }
    func stopBackgroundSync() async throws { active = false; calls.append("stop") }
    func resetAnchors() { calls.append("resetAnchors") }
    func restoreAtLaunch() { calls.append("restore") }
}

@MainActor
final class MemoryBinding: BindingStore {
    var value: SyncBinding?
    func get() throws -> SyncBinding? { value }
    func set(_ binding: SyncBinding) throws { value = binding }
    func clear() throws { value = nil }
}

@MainActor
struct FixedSource: SyncSessionSource {
    var session: SyncSession
    func syncSession() async throws -> SyncSession { session }
}

@MainActor
@Suite struct PhoneSyncTests {
    let me = "https://a.example#2"
    let session = SyncSession(owUserId: "ow-2", accessToken: "a", refreshToken: "r", host: "https://a.example/ow")

    @Test func connectSignsInBindsAndStarts() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        let state = try await PhoneSync(sdk: sdk, store: store).connect(source: FixedSource(session: session), athleteKey: me)
        #expect(state == .syncing)
        #expect(sdk.userId == "ow-2")
        #expect(sdk.host == "https://a.example/ow")
        #expect(store.value == SyncBinding(athleteKey: me, owUserId: "ow-2", host: "https://a.example/ow", authorizedTypes: PhoneSync.authorizedTypes))
        #expect(sdk.calls.last == "start(\(PhoneSync.historyDays))")
    }

    @Test func connectEndsAnotherUsersSessionFirst() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-1"; sdk.active = true
        store.value = SyncBinding(athleteKey: "https://a.example#1", owUserId: "ow-1", host: "https://a.example/ow")
        _ = try await PhoneSync(sdk: sdk, store: store).connect(source: FixedSource(session: session), athleteKey: me)
        #expect(Array(sdk.calls.prefix(2)) == ["stop", "signOut"])
        #expect(store.value?.owUserId == "ow-2")
    }

    @Test func reconcileEndsASessionThatIsNotThisAthletes() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-1"; sdk.active = true
        store.value = SyncBinding(athleteKey: "https://a.example#1", owUserId: "ow-1", host: "https://a.example/ow", authorizedTypes: PhoneSync.authorizedTypes)
        let r = try await PhoneSync(sdk: sdk, store: store).reconcile(athleteKey: me)
        #expect(r == .init(state: .off, reset: true))
        #expect(sdk.userId == nil)
        #expect(store.value == nil)
    }

    @Test func reconcileEndsASessionAfterSignOut() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-2"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-2", host: "h", authorizedTypes: PhoneSync.authorizedTypes)
        let r = try await PhoneSync(sdk: sdk, store: store).reconcile(athleteKey: nil)
        #expect(r.reset)
        #expect(sdk.userId == nil)
    }

    @Test func reconcileKeepsTheAthletesOwnSession() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-2"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-2", host: "h", authorizedTypes: PhoneSync.authorizedTypes)
        let r = try await PhoneSync(sdk: sdk, store: store).reconcile(athleteKey: me)
        #expect(r == .init(state: .syncing, reset: false))
        #expect(!sdk.calls.contains("signOut"))
    }

    @Test func reconcileAsksAgainWhenAnUpdateAddedTypes() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-2"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-2", host: "h", authorizedTypes: "steps")
        _ = try await PhoneSync(sdk: sdk, store: store).reconcile(athleteKey: me)
        #expect(sdk.calls.contains("authorize"))
        #expect(store.value?.authorizedTypes == PhoneSync.authorizedTypes)
    }

    @Test func refreshForADifferentUserResets() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-1"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-1", host: "https://a.example/ow")
        let r = try await PhoneSync(sdk: sdk, store: store).refreshTokens(source: FixedSource(session: session), athleteKey: me)
        #expect(r == .reset)
        #expect(sdk.userId == nil)
    }

    @Test func refreshForTheSameUserUpdatesTokens() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-2"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-2", host: "https://a.example/ow")
        let r = try await PhoneSync(sdk: sdk, store: store).refreshTokens(source: FixedSource(session: session), athleteKey: me)
        #expect(r == .refreshed)
        #expect(sdk.tokens?.0 == "a")
    }

    @Test func anIPadNeverRelays() async throws {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.isTablet = true
        await #expect(throws: SyncError(PhoneSync.tabletMessage)) {
            _ = try await PhoneSync(sdk: sdk, store: store).connect(source: FixedSource(session: session), athleteKey: me)
        }
        #expect(sdk.calls.isEmpty)
    }

    @Test func launchRestoresOnlyItsOwnBoundSession() {
        let sdk = FakeSDK(), store = MemoryBinding()
        sdk.userId = "ow-2"; sdk.active = true
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-1", host: "h")
        #expect(!PhoneSync(sdk: sdk, store: store).restoreAtLaunch())
        store.value = SyncBinding(athleteKey: me, owUserId: "ow-2", host: "h")
        #expect(PhoneSync(sdk: sdk, store: store).restoreAtLaunch())
    }
}

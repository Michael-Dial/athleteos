// What the app uses of OW's iOS SDK, as protocols. The app target adapts the
// real SDK (OWHealthSDK.swift); the rules in PhoneSync.swift take these, so
// they run under `swift test` with a fake.

import Foundation

@MainActor
public protocol HealthSDK: AnyObject {
    var isTablet: Bool { get }
    func configure(host: String)
    /// The backend user the SDK holds credentials for, or nil when signed out.
    func storedUserId() -> String?
    func isSessionValid() -> Bool
    func isSyncActive() -> Bool
    func signIn(owUserId: String, accessToken: String, refreshToken: String) async throws
    func updateTokens(accessToken: String, refreshToken: String)
    func signOut() async throws
    /// HealthKit never says whether reading was refused, so the answer is not read.
    func requestAuthorization(types: [String]) async throws -> Bool
    func startBackgroundSync(daysBack: Int) async throws -> Bool
    func stopBackgroundSync() async throws
    func resetAnchors()
    /// Re-register the SDK's HealthKit observers for its stored session, for a launch with no UI.
    func restoreAtLaunch()
}

/// Which athlete (on which server) and which backend user the SDK's stored
/// session belongs to. The SDK keeps its credentials across launches and
/// knows nothing of AthleteOS; this record is how the app tells "same person,
/// still syncing" from "someone else signed in on this phone".
public struct SyncBinding: Codable, Hashable, Sendable {
    public var athleteKey: String
    public var owUserId: String
    public var host: String
    /// The Health types this session last asked for, joined by ",". When it is not
    /// `PhoneSync.authorizedTypes` (an update added types), the next launch asks again.
    public var authorizedTypes: String?

    public init(athleteKey: String, owUserId: String, host: String, authorizedTypes: String? = nil) {
        self.athleteKey = athleteKey
        self.owUserId = owUserId
        self.host = host
        self.authorizedTypes = authorizedTypes
    }
}

@MainActor
public protocol BindingStore: AnyObject {
    func get() throws -> SyncBinding?
    func set(_ binding: SyncBinding) throws
    func clear() throws
}

/// A token pair for the athlete's own backend user, and where the SDK sends data.
public struct SyncSession: Hashable, Sendable {
    public let owUserId: String
    public let accessToken: String
    public let refreshToken: String
    /// `{server}{syncPath}`: the SDK appends /api/v1/… itself.
    public let host: String

    public init(owUserId: String, accessToken: String, refreshToken: String, host: String) {
        self.owUserId = owUserId
        self.accessToken = accessToken
        self.refreshToken = refreshToken
        self.host = host
    }
}

/// Where sync sessions come from: AthleteOS's `POST /wearables/sdk-token`.
/// No backend credential ships in the app.
@MainActor
public protocol SyncSessionSource {
    func syncSession() async throws -> SyncSession
}

extension APIClient: SyncSessionSource {
    public func syncSession() async throws -> SyncSession {
        let r = try await postWearablesSdkToken()
        let path = r.syncPath.hasPrefix("/") ? String(r.syncPath.dropFirst()) : r.syncPath
        return SyncSession(owUserId: r.owUserId, accessToken: r.accessToken, refreshToken: r.refreshToken, host: baseURL.appendingPathComponent(path).absoluteString)
    }
}

@MainActor
public final class StoredBinding: BindingStore {
    let storage: SecureStorage
    static let key = "athleteos.sync-binding"

    public init(storage: SecureStorage) { self.storage = storage }

    public func get() throws -> SyncBinding? {
        guard let d = try storage.read(Self.key) else { return nil }
        return try JSONDecoder().decode(SyncBinding.self, from: d)
    }

    public func set(_ binding: SyncBinding) throws { try storage.write(Self.key, try JSONEncoder().encode(binding)) }
    public func clear() throws { try storage.delete(Self.key) }
}

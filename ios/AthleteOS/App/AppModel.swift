import AthleteKit
import Foundation
import Observation
import UIKit

/// The signed-in state of the app and the phone's Apple Health sync. Screens
/// fetch their own data through `client`; this holds only what outlives a screen.
@MainActor
@Observable
final class AppModel {
    private(set) var credentials: Credentials?
    private(set) var client: APIClient?
    /// An emailed-code step in progress for a password sign-in.
    private(set) var pendingChallenge: (server: URL, challenge: EmailChallenge)?
    /// An invite link opened before sign-in fills the code in for the person.
    var pendingInvite: (code: String, server: URL?)?
    private(set) var sync: SyncState = .off
    var syncMessage: String?

    private let store: CredentialStore
    private let sdk: OWHealthSDK
    private let bindings: StoredBinding

    init(store: CredentialStore, sdk: OWHealthSDK, bindings: StoredBinding) {
        self.store = store
        self.sdk = sdk
        self.bindings = bindings
        if let c = store.load() { adopt(c) }
        sdk.onAuthError = { [weak self] in Task { await self?.refreshSyncTokens() } }
    }

    static func live() -> AppModel {
        let keychain = Keychain()
        return AppModel(store: CredentialStore(storage: keychain), sdk: OWHealthSDK(), bindings: StoredBinding(storage: keychain))
    }

    private var phoneSync: PhoneSync { PhoneSync(sdk: sdk, store: bindings) }
    private var deviceName: String { UIDevice.current.name }

    private func adopt(_ c: Credentials) {
        credentials = c
        client = APIClient(baseURL: c.server, token: c.token) { [weak self] in
            // The server no longer accepts this phone's token (revoked in Settings): sign out here too.
            Task { @MainActor in await self?.forget(revoke: false) }
        }
    }

    private func save(_ c: Credentials) throws {
        try store.save(c)
        pendingChallenge = nil
        pendingInvite = nil
        adopt(c)
        Task { await reconcileSync() }
    }

    // MARK: sign-in

    func redeem(code raw: String, server: URL) async throws {
        guard let code = InviteCode.normalize(raw) else {
            throw APIError(status: 0, code: "bad_code_format", message: "An invite code is 10 letters and digits, like 7KQ2M-X9D4R.")
        }
        let r = try await APIClient(baseURL: server, token: nil).postAuthInvite(body: AuthInvitePostBody(code: code, name: deviceName))
        try save(Credentials(server: server, token: r.token, tokenId: Int(r.id), athleteId: Int(r.athlete.id), athleteName: r.athlete.name))
    }

    func signIn(password: String, server: URL) async throws {
        switch try await APIClient(baseURL: server, token: nil).postAuthToken(password: password, deviceName: deviceName) {
        case .signedIn(let t): try await finishPasswordSignIn(server: server, token: t)
        case .needsCode(let c): pendingChallenge = (server, c)
        }
    }

    func verify(code: String) async throws {
        guard let p = pendingChallenge else { return }
        let r = try await APIClient(baseURL: p.server, token: nil).postAuthTokenVerify(body: AuthTokenVerifyPostBody(challengeId: p.challenge.challengeId, code: code.trimmingCharacters(in: .whitespaces)))
        try await finishPasswordSignIn(server: p.server, token: GrantedToken(token: r.token, id: r.id, name: r.name, createdAt: r.createdAt))
    }

    func cancelChallenge() { pendingChallenge = nil }

    private func finishPasswordSignIn(server: URL, token: GrantedToken) async throws {
        let me = try await APIClient(baseURL: server, token: token.token).getMe()
        try save(Credentials(server: server, token: token.token, tokenId: Int(token.id), athleteId: Int(me.athlete.id), athleteName: me.athlete.name))
    }

    func open(_ url: URL) {
        guard let invite = InviteCode.fromLink(url) else { return }
        // Already signed in as someone: the link is ignored rather than silently switching athletes.
        if credentials == nil { pendingInvite = invite }
    }

    /// Sign out: Apple Health sync on this phone stops and the server forgets this phone's token.
    func signOut() async { await forget(revoke: true) }

    private func forget(revoke: Bool) async {
        do { try await phoneSync.disconnect() } catch { syncMessage = error.localizedDescription }
        if revoke, let c = credentials, let client {
            try? await client.deleteAuthTokensById(id: String(c.tokenId))
        }
        try? store.clear()
        credentials = nil
        client = nil
        sync = .off
    }

    // MARK: Apple Health

    func reconcileSync() async {
        do { sync = try await phoneSync.reconcile(athleteKey: credentials?.athleteKey).state }
        catch { syncMessage = error.localizedDescription }
    }

    func turnOnAppleHealth() async {
        guard let c = credentials, let client else { return }
        syncMessage = nil
        do { sync = try await phoneSync.connect(source: client, athleteKey: c.athleteKey) }
        catch { syncMessage = error.localizedDescription; await reconcileSync() }
    }

    func turnOffAppleHealth() async {
        syncMessage = nil
        do { try await phoneSync.disconnect(); sync = .off }
        catch { syncMessage = error.localizedDescription }
    }

    func resendHealthHistory() async {
        guard let c = credentials else { return }
        syncMessage = nil
        do { sync = try await phoneSync.resyncAllHistory(athleteKey: c.athleteKey) }
        catch { syncMessage = error.localizedDescription }
    }

    private func refreshSyncTokens() async {
        guard let c = credentials, let client else { return }
        do {
            if try await phoneSync.refreshTokens(source: client, athleteKey: c.athleteKey) == .reset {
                sync = .off
                syncMessage = "Apple Health sync was stopped because your account changed. Turn it on again."
            }
        } catch { syncMessage = error.localizedDescription }
    }
}

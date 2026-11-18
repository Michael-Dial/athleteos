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
    /// A sign-up waiting for its emailed confirmation code.
    private(set) var pendingRegistration: (server: URL, challenge: AuthRegisterPostResponse)?
    /// An invite code from an athleteos://invite link, waiting for the sign-in screen to fill it in.
    var pendingInviteCode: String?
    /// First-run setup still to show on this phone; nil when there is nothing to do.
    private(set) var setup: SetupPlan?
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
        pendingRegistration = nil
        pendingInviteCode = nil
        adopt(c)
        Task { await reconcileSync(); await planSetup() }
    }

    // MARK: sign-in

    /// An invite (or reset) code from Settings → Users and the password the person chooses.
    func redeem(code raw: String, password: String, server: URL) async throws {
        guard let code = InviteCode.normalize(raw) else {
            throw APIError(status: 0, code: "bad_code_format", message: "An invite code has 12 letters and digits, like K7QM-2XRA-9TPD.")
        }
        let r = try await APIClient(baseURL: server, token: nil).postAuthInvite(body: AuthInvitePostBody(code: code, password: password, name: deviceName))
        try save(Credentials(server: server, token: r.token, tokenId: Int(r.id), athleteId: Int(r.athlete.id), athleteName: r.athlete.name))
    }

    func signIn(email: String, password: String, server: URL) async throws {
        switch try await APIClient(baseURL: server, token: nil).postAuthToken(email: email.trimmingCharacters(in: .whitespaces), password: password, deviceName: deviceName) {
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

    /// Whether this server takes sign-ups, and why not when it doesn't.
    func registration(server: URL) async throws -> AuthRegistrationResponse {
        try await APIClient(baseURL: server, token: nil).getAuthRegistration()
    }

    /// Step one of sign-up: the server emails a code; nothing is created until it is entered.
    func register(name: String, email: String, password: String, server: URL) async throws {
        let body = AuthRegisterPostBody(name: name.trimmingCharacters(in: .whitespaces), email: email.trimmingCharacters(in: .whitespaces), password: password, device: deviceName)
        pendingRegistration = (server, try await APIClient(baseURL: server, token: nil).postAuthRegister(body: body))
    }

    func verifyRegistration(code: String) async throws {
        guard let p = pendingRegistration else { return }
        let r = try await APIClient(baseURL: p.server, token: nil).postAuthRegisterVerify(body: AuthRegisterVerifyPostBody(challengeId: p.challenge.challengeId, code: code.trimmingCharacters(in: .whitespaces)))
        try save(Credentials(server: p.server, token: r.token, tokenId: Int(r.id), athleteId: Int(r.athlete.id), athleteName: r.athlete.name))
    }

    func cancelRegistration() { pendingRegistration = nil }

    /// athleteos://invite?code=K7QM-2XRA-9TPD, from the web invite page on an iPhone.
    func open(_ url: URL) {
        guard url.scheme == "athleteos", url.host() == "invite", credentials == nil,
              let raw = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first(where: { $0.name == "code" })?.value,
              let code = InviteCode.normalize(raw) else { return }
        pendingInviteCode = code
    }

    private func finishPasswordSignIn(server: URL, token: GrantedToken) async throws {
        let me = try await APIClient(baseURL: server, token: token.token).getMe()
        try save(Credentials(server: server, token: token.token, tokenId: Int(token.id), athleteId: Int(me.athlete.id), athleteName: me.athlete.name))
    }

    /// Sign out: Apple Health sync on this phone stops and the server forgets this phone's token.
    func signOut() async { await forget(revoke: true) }

    /// Deletes the account on the server (the password is asked again there), then forgets it here.
    func deleteAccount(password: String) async throws {
        guard let client else { return }
        try await client.postMeDelete(body: MeDeletePostBody(password: password))
        if let c = credentials { setupDefaults.removeObject(forKey: healthAskedKey(c)) }
        await forget(revoke: false)
    }

    private func forget(revoke: Bool) async {
        do { try await phoneSync.disconnect() } catch { syncMessage = error.localizedDescription }
        if revoke, let c = credentials, let client {
            try? await client.deleteAuthTokensById(id: String(c.tokenId))
        }
        try? store.clear()
        credentials = nil
        client = nil
        setup = nil
        sync = .off
    }

    // MARK: first-run setup

    // The account's setup (connect wearables, first check-in) is shared with the
    // web, so whichever finishes it first marks it on the server and the other
    // doesn't ask again. Apple Health can only be turned on from this phone, so
    // each phone asks once, remembered here per athlete.
    private let setupDefaults = UserDefaults.standard
    private func healthAskedKey(_ c: Credentials) -> String { "setup.healthAsked.\(c.athleteKey)" }

    func planSetup() async {
        guard let c = credentials, let client else { return }
        do {
            let me = try await client.getMe()
            let askHealth = me.openWearables.configured && sync != .syncing && !setupDefaults.bool(forKey: healthAskedKey(c))
            let plan = SetupPlan(firstName: c.athleteName.split(separator: " ").first.map(String.init) ?? c.athleteName,
                                 today: me.today, account: !(me.user.onboarded ?? true), health: askHealth, wearables: me.openWearables.configured)
            setup = plan.isEmpty ? nil : plan
        } catch {
            // Setup is a convenience: when the server can't be reached the app opens as usual and asks next launch.
            setup = nil
        }
    }

    /// Finished or skipped: the account's part is marked on the server, this phone's here.
    func finishSetup() async {
        guard let c = credentials else { setup = nil; return }
        setupDefaults.set(true, forKey: healthAskedKey(c))
        if setup?.account == true { try? await client?.postMeOnboarded() }
        setup = nil
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

/// What first-run setup has left to ask on this phone.
struct SetupPlan: Equatable {
    let firstName: String
    let today: String
    /// The account hasn't been set up anywhere yet: welcome, wearables and the first check-in.
    let account: Bool
    /// Ask to turn on Apple Health on this phone.
    let health: Bool
    /// Device accounts can be connected on this server.
    let wearables: Bool

    var steps: [SetupStep] {
        var s: [SetupStep] = []
        if account { s.append(.welcome) }
        if health { s.append(.health) }
        if account && wearables { s.append(.wearables) }
        if account { s.append(.checkIn) }
        if !s.isEmpty { s.append(.done) }
        return s
    }

    var isEmpty: Bool { steps.isEmpty }
}

enum SetupStep: Hashable { case welcome, health, wearables, checkIn, done }

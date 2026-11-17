import AthleteKit
import AuthenticationServices
import SwiftUI

/// Connect wearables and turn on Apple Health. Brands and statuses only:
/// where the data is kept is the server's business.
struct AccountsView: View {
    let client: APIClient
    @Environment(AppModel.self) private var model
    @State private var reload = 0
    @State private var busy: String?
    @State private var message: String?
    @State private var auth = WebAuth()

    var body: some View {
        LoadingView(load: { try await client.getAccounts() }) { a in
            List {
                ForEach(a.errors, id: \.self) { Notice(text: $0, kind: .bad) }
                if let message { Section { Notice(text: message, kind: .info) } }

                let phone = a.services.filter { $0.kind == .phone && $0.provider == "apple" }
                if !phone.isEmpty { appleHealth(phone[0]) }

                Section {
                    ForEach(a.services.filter { $0.kind == .cloud }, id: \.provider) { s in
                        HStack {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(s.name).font(.body.weight(.medium))
                                Text(statusText(s.status.rawValue, s.lastSyncedAt)).font(.caption).foregroundStyle(s.status == .lapsed ? Palette.warn : .secondary)
                            }
                            Spacer()
                            Button(s.status == .none ? "Connect" : "Reconnect") { connect(s.provider, s.name) }
                                .buttonStyle(.bordered).disabled(busy != nil)
                        }
                    }
                } header: {
                    Text("Wearable accounts")
                } footer: {
                    Text("You sign in on the maker's site, then come back here.")
                }

                if !a.accounts.isEmpty {
                    Section("Your accounts") {
                        ForEach(a.accounts, id: \.id) { c in
                            HStack {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(c.name).font(.body.weight(.medium))
                                    Text([c.device ?? c.label, statusText(c.status == .connected ? "connected" : "lapsed", c.lastSyncedAt)].joined(separator: " · "))
                                        .font(.caption).foregroundStyle(c.status == .connected ? .secondary : Palette.warn)
                                }
                                Spacer()
                                if c.canSync {
                                    Button("Sync now") { syncNow(c.provider, c.name) }.buttonStyle(.bordered).disabled(busy != nil)
                                }
                            }
                        }
                    }
                }
            }
        }
        .id(reload)
        .navigationTitle("Connected accounts")
    }

    @ViewBuilder private func appleHealth(_ s: AccountsResponse.Service) -> some View {
        Section {
            Toggle(isOn: Binding(get: { model.sync == .syncing }, set: { on in
                Task { if on { await model.turnOnAppleHealth() } else { await model.turnOffAppleHealth() }; reload += 1 }
            })) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Apple Health").font(.body.weight(.medium))
                    Text(model.sync == .paused ? "Paused on this phone" : statusText(s.status.rawValue, s.lastSyncedAt)).font(.caption).foregroundStyle(.secondary)
                }
            }
            if model.sync == .syncing {
                Button("Send all Health history") { Task { await model.resendHealthHistory() } }
            }
            if let m = model.syncMessage { Notice(text: m, kind: .bad) }
        } header: {
            Text("On this phone")
        } footer: {
            Text("Sends the last 30 days, then keeps syncing in the background, including from an Apple Watch. Turning it off stops sending; nothing already sent is deleted.")
        }
    }

    private func statusText(_ status: String, _ last: String?) -> String {
        switch status {
        case "connected": "Connected · synced \(Fmt.relative(last))"
        case "lapsed": "Not syncing: reconnect"
        default: "Not connected"
        }
    }

    private func connect(_ provider: String, _ name: String) {
        busy = provider; message = nil
        Task {
            defer { busy = nil }
            do {
                let r = try await client.postAccountsByProviderConnect(provider: provider, body: .init(returnTo: .app))
                guard let url = URL(string: r.authorizationUrl) else { return }
                _ = try await auth.start(url: url, callbackScheme: "athleteos")
                message = "\(name) is connected. Its data appears after the first sync, usually within a few minutes."
                reload += 1
            } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            } catch { message = error.localizedDescription }
        }
    }

    private func syncNow(_ provider: String, _ name: String) {
        busy = provider; message = nil
        Task {
            defer { busy = nil }
            do { _ = try await client.postAccountsByProviderSync(provider: provider); message = "Asked \(name) for new data." }
            catch { message = error.localizedDescription }
        }
    }
}

/// ASWebAuthenticationSession as an async call. It catches the athleteos:// return itself.
@MainActor
final class WebAuth: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?

    func start(url: URL, callbackScheme: String) async throws -> URL {
        try await withCheckedThrowingContinuation { done in
            let s = ASWebAuthenticationSession(url: url, callback: .customScheme(callbackScheme)) { url, error in
                if let url { done.resume(returning: url) } else { done.resume(throwing: error ?? ASWebAuthenticationSessionError(.canceledLogin)) }
            }
            s.presentationContextProvider = self
            session = s
            s.start()
        }
    }

    nonisolated func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        MainActor.assumeIsolated {
            UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first ?? ASPresentationAnchor()
        }
    }
}

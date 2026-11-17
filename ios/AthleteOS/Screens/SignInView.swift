import AthleteKit
import SwiftUI

/// Invited athletes type the admin's code; the admin signs in with the
/// AthleteOS password. Both end with a token for this phone only.
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var password = ""
    @State private var emailCode = ""
    @State private var serverText = ServerAddress.default.absoluteString
    @State private var usePassword = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    enum Field { case code, password, emailCode }

    private var server: URL? { ServerAddress.parse(serverText) }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("AthleteOS").font(.largeTitle.weight(.bold))
                        Text("Your plan, your training and your wearables in one place.").foregroundStyle(.secondary)
                    }
                    .listRowBackground(Color.clear)
                }

                if let challenge = model.pendingChallenge?.challenge {
                    Section {
                        TextField("6-digit code", text: $emailCode)
                            .keyboardType(.numberPad).textContentType(.oneTimeCode).focused($focus, equals: .emailCode)
                        Button(busy ? "Checking…" : "Verify code") { run { try await model.verify(code: emailCode) } }
                            .disabled(busy || emailCode.count < 6)
                        Button("Start over", role: .cancel) { model.cancelChallenge() }
                    } header: {
                        Text("Check your email")
                    } footer: {
                        Text("We sent a code to \(challenge.destination). It expires in 10 minutes.")
                    }
                } else if usePassword {
                    Section {
                        SecureField("AthleteOS password", text: $password).textContentType(.password).focused($focus, equals: .password)
                            .onSubmit(signInWithPassword)
                        Button(busy ? "Signing in…" : "Sign in", action: signInWithPassword).disabled(busy || password.isEmpty || server == nil)
                    } header: {
                        Text("Sign in with password")
                    } footer: {
                        Text("For the account that runs this AthleteOS server.")
                    }
                } else {
                    Section {
                        TextField("Invite code", text: $code, prompt: Text("7KQ2M-X9D4R"))
                            .textInputAutocapitalization(.characters).autocorrectionDisabled().font(.title3.monospaced())
                            .focused($focus, equals: .code).onSubmit(redeem)
                        Button(busy ? "Joining…" : "Join", action: redeem)
                            .disabled(busy || InviteCode.normalize(code) == nil || server == nil)
                    } header: {
                        Text("Enter your invite code")
                    } footer: {
                        Text("Your coach or admin gives you a one-time code. It works once, on one phone.")
                    }
                }

                if let error { Section { Notice(text: error, kind: .bad) } }

                Section {
                    if model.pendingChallenge == nil {
                        Button(usePassword ? "I have an invite code" : "Sign in with a password instead") {
                            usePassword.toggle(); error = nil
                        }
                    }
                    DisclosureGroup("Server") {
                        TextField("Server address", text: $serverText)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        if server == nil { Notice(text: "Use an https address, like athleteos.example.org.", kind: .bad) }
                    }
                }
            }
            .onAppear(perform: takePendingInvite)
            .onChange(of: model.pendingInvite?.code) { takePendingInvite() }
        }
    }

    private func takePendingInvite() {
        guard let invite = model.pendingInvite else { return }
        code = invite.code
        if let s = invite.server { serverText = s.absoluteString }
        usePassword = false
    }

    private func redeem() {
        guard let server else { return }
        run { try await model.redeem(code: code, server: server) }
    }

    private func signInWithPassword() {
        guard let server, !password.isEmpty else { return }
        run { try await model.signIn(password: password, server: server) }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }
}

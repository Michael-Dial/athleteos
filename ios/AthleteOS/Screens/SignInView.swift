import AthleteKit
import SwiftUI

/// Sign in with email and password, or accept an invite: the code from
/// Settings → Users plus the password the person chooses (the same code the
/// web's invite page takes). Both end with a token for this phone only.
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var mode = Mode.signIn
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var code = ""
    @State private var emailCode = ""
    @State private var serverText = ServerAddress.default.absoluteString
    @State private var busy = false
    @State private var error: String?

    enum Mode { case signIn, invite }

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
                        TextField("6-digit code", text: $emailCode).keyboardType(.numberPad).textContentType(.oneTimeCode)
                        Button(busy ? "Checking…" : "Verify code") { run { try await model.verify(code: emailCode) } }
                            .disabled(busy || emailCode.count < 6)
                        Button("Start over", role: .cancel) { model.cancelChallenge() }
                    } header: {
                        Text("Check your email")
                    } footer: {
                        Text("We sent a code to \(challenge.destination). It expires in 10 minutes.")
                    }
                } else if mode == .signIn {
                    Section {
                        TextField("Email", text: $email)
                            .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("Password", text: $password).textContentType(.password).onSubmit(signIn)
                        Button(busy ? "Signing in…" : "Sign in", action: signIn)
                            .disabled(busy || email.isEmpty || password.isEmpty || server == nil)
                    } header: {
                        Text("Sign in")
                    }
                } else {
                    Section {
                        TextField("Invite code", text: $code, prompt: Text("K7QM-2XRA-9TPD"))
                            .textInputAutocapitalization(.characters).autocorrectionDisabled().font(.title3.monospaced())
                        SecureField("New password", text: $password).textContentType(.newPassword)
                        SecureField("Repeat password", text: $confirm).textContentType(.newPassword).onSubmit(redeem)
                        Button(busy ? "Joining…" : "Join", action: redeem)
                            .disabled(busy || InviteCode.normalize(code) == nil || password.isEmpty || server == nil)
                    } header: {
                        Text("Accept an invite")
                    } footer: {
                        Text("Your admin sends a code like K7QM-2XRA-9TPD. It works once. Choose a password of at least \(InviteCode.minPasswordLength) characters; it also signs you in on the web.")
                    }
                }

                if let error { Section { Notice(text: error, kind: .bad) } }

                Section {
                    if model.pendingChallenge == nil {
                        Button(mode == .signIn ? "I have an invite code" : "I already have a password") {
                            mode = mode == .signIn ? .invite : .signIn
                            error = nil
                        }
                    }
                    DisclosureGroup("Server") {
                        TextField("Server address", text: $serverText)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        if server == nil { Notice(text: "Use an https address, like athleteos.example.org.", kind: .bad) }
                    }
                }
            }
        }
    }

    private func signIn() {
        guard let server, !email.isEmpty, !password.isEmpty else { return }
        run { try await model.signIn(email: email, password: password, server: server) }
    }

    /// Length and match are checked here so a typo doesn't spend the single-use code.
    private func redeem() {
        guard let server else { return }
        guard password.count >= InviteCode.minPasswordLength else {
            error = "Choose a password of at least \(InviteCode.minPasswordLength) characters."
            return
        }
        guard password == confirm else {
            error = "The two passwords don't match."
            return
        }
        run { try await model.redeem(code: code, password: password, server: server) }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }
}

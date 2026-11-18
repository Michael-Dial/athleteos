import AthleteKit
import SwiftUI

/// The signed-out app: what AthleteOS does, then three ways in. Create an
/// account (when the server takes sign-ups), sign in with a password, or
/// accept an invite code from Settings → Users (the same code the web's
/// invite page takes). Each ends with a token for this phone only.
struct SignInView: View {
    @Environment(AppModel.self) private var model
    @State private var path: [Route] = []
    @State private var serverText = ServerAddress.default.absoluteString
    @State private var registration: AuthRegistrationResponse?
    @State private var editingServer = false

    enum Route: Hashable { case register, signIn, invite }

    private var server: URL? { ServerAddress.parse(serverText) }
    /// Offered unless the server says no; an older server without sign-up answers the form with its own error.
    private var canRegister: Bool { registration?.available ?? true }

    var body: some View {
        NavigationStack(path: $path) {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("AthleteOS").font(.largeTitle.weight(.bold))
                        Text("Know each morning whether to train hard or back off, from your own wearables and how you feel.")
                            .font(.title3).foregroundStyle(.secondary)
                    }
                    VStack(alignment: .leading, spacing: 20) {
                        ValueRow(symbol: "gauge.with.needle", title: "Readiness every morning", detail: "HRV, resting heart rate, sleep and a quick check-in, against your own normal ranges.")
                        ValueRow(symbol: "calendar", title: "Plan against what you did", detail: "Sessions from every device, counted once.")
                        ValueRow(symbol: "applewatch", title: "Every number names its device", detail: "So a new watch never looks like a change in you.")
                    }
                }
                .padding(.horizontal, 24)
                .padding(.top, 32)
                .frame(maxWidth: 560, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .scrollBounceBehavior(.basedOnSize)
            // The ways in sit at the bottom, in thumb reach, above the home indicator.
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 12) {
                    if canRegister {
                        NavigationLink(value: Route.register) { Text("Create account") }.buttonStyle(PrimaryButtonStyle())
                        NavigationLink(value: Route.signIn) { Text("Sign in") }.buttonStyle(SecondaryButtonStyle())
                    } else {
                        NavigationLink(value: Route.signIn) { Text("Sign in") }.buttonStyle(PrimaryButtonStyle())
                    }
                    NavigationLink(value: Route.invite) { Text("I have an invite code").frame(minHeight: 44) }
                    if let reason = registration?.reason, !canRegister {
                        Text(reason).font(.footnote).foregroundStyle(.secondary).multilineTextAlignment(.center)
                    }
                    Button { editingServer = true } label: {
                        Text("Server: \(server?.host() ?? "not set")").font(.footnote).frame(minHeight: 44)
                    }
                    .foregroundStyle(.secondary)
                    .accessibilityHint("Change which AthleteOS server this app uses")
                }
                .padding(.horizontal, 24)
                .padding(.top, 12)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .background(.bar)
            }
            .toolbar(.hidden, for: .navigationBar)
            .navigationDestination(for: Route.self) { route in
                if let server {
                    switch route {
                    case .register: RegisterView(server: server)
                    case .signIn: PasswordSignInView(server: server)
                    case .invite: InviteView(server: server)
                    }
                } else {
                    ContentUnavailableView("Set a server first", systemImage: "server.rack", description: Text("Tap Server at the bottom of the first screen and enter your AthleteOS address."))
                }
            }
            .sheet(isPresented: $editingServer) { ServerSheet(serverText: $serverText) }
        }
        .task(id: serverText) {
            registration = nil
            guard let server else { return }
            registration = try? await model.registration(server: server)
        }
        // An athleteos://invite link opens straight on the invite form with the code filled in.
        .onChange(of: model.pendingInviteCode, initial: true) { _, code in
            if code != nil { path = [.invite] }
        }
    }
}

/// Which AthleteOS server to use. Most people never change it.
private struct ServerSheet: View {
    @Binding var serverText: String
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Server address", text: $draft)
                        .keyboardType(.URL).textContentType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit(save)
                } footer: {
                    if ServerAddress.parse(draft) == nil { Text("Use an https address, like athleteos.example.org.") }
                    else { Text("Only change this if whoever runs your AthleteOS gave you a different address.") }
                }
            }
            .navigationTitle("Server")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save", action: save).disabled(ServerAddress.parse(draft) == nil) }
            }
        }
        .onAppear { draft = serverText }
        .presentationDetents([.medium, .large])
    }

    private func save() {
        guard ServerAddress.parse(draft) != nil else { return }
        serverText = draft
        dismiss()
    }
}

// MARK: - Create account

private struct RegisterView: View {
    let server: URL
    @Environment(AppModel.self) private var model
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var code = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    enum Field { case name, email, password, confirm, code }

    var body: some View {
        Form {
            if let pending = model.pendingRegistration?.challenge {
                Section {
                    TextField("6-digit code", text: $code)
                        .keyboardType(.numberPad).textContentType(.oneTimeCode).font(.title2.monospacedDigit())
                        .focused($focus, equals: .code)
                    Button(busy ? "Checking…" : "Confirm and continue", action: verify)
                        .disabled(busy || code.filter(\.isNumber).count != 6)
                } header: {
                    Text("Check your email")
                } footer: {
                    Text("We sent a code to \(pending.destination). It expires in 10 minutes. If that address already has an account, the email says so instead: sign in, or use Forgot password on the website.")
                }
                Section {
                    Button("Change details or send a new code") { model.cancelRegistration(); code = ""; error = nil }
                }
            } else {
                Section {
                    TextField("Your name", text: $name)
                        .textContentType(.name).submitLabel(.next).focused($focus, equals: .name).onSubmit { focus = .email }
                    TextField("Email", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.next).focused($focus, equals: .email).onSubmit { focus = .password }
                } footer: {
                    Text("Your name shows on your dashboards. We email a code to confirm the address.")
                }
                Section {
                    SecureField("Password", text: $password)
                        .textContentType(.newPassword).submitLabel(.next).focused($focus, equals: .password).onSubmit { focus = .confirm }
                    SecureField("Same password again", text: $confirm)
                        .textContentType(.newPassword).submitLabel(.go).focused($focus, equals: .confirm).onSubmit(start)
                } footer: {
                    Text("At least \(InviteCode.minPasswordLength) characters. It also signs you in on the website.")
                }
                Section {
                    Button(busy ? "Sending code…" : "Create account", action: start)
                        .disabled(busy || name.trimmingCharacters(in: .whitespaces).isEmpty || email.isEmpty || password.isEmpty)
                }
            }
            if let error { Section { Notice(text: error, kind: .bad) } }
        }
        .navigationTitle("Create account")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { focus = model.pendingRegistration == nil ? .name : .code }
        // Leaving the screen abandons an unconfirmed sign-up; the next attempt sends a fresh code.
        .onDisappear { if model.credentials == nil { model.cancelRegistration() } }
    }

    /// Length and match are checked here so a typo doesn't send an email.
    private func start() {
        guard password.count >= InviteCode.minPasswordLength else { error = "Choose a password of at least \(InviteCode.minPasswordLength) characters."; return }
        guard password == confirm else { error = "The two passwords don't match."; return }
        run {
            try await model.register(name: name, email: email, password: password, server: server)
            focus = .code
        }
    }

    private func verify() { run { try await model.verifyRegistration(code: code) } }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Sign in

private struct PasswordSignInView: View {
    let server: URL
    @Environment(AppModel.self) private var model
    @State private var email = ""
    @State private var password = ""
    @State private var emailCode = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    enum Field { case email, password, code }

    var body: some View {
        Form {
            if let challenge = model.pendingChallenge?.challenge {
                Section {
                    TextField("6-digit code", text: $emailCode)
                        .keyboardType(.numberPad).textContentType(.oneTimeCode).font(.title2.monospacedDigit())
                        .focused($focus, equals: .code)
                    Button(busy ? "Checking…" : "Verify code") { run { try await model.verify(code: emailCode) } }
                        .disabled(busy || emailCode.filter(\.isNumber).count != 6)
                } header: {
                    Text("Check your email")
                } footer: {
                    Text("We sent a code to \(challenge.destination). It expires in 10 minutes.")
                }
                Section { Button("Start over") { model.cancelChallenge(); emailCode = "" } }
            } else {
                Section {
                    TextField("Email", text: $email)
                        .textContentType(.username).keyboardType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .submitLabel(.next).focused($focus, equals: .email).onSubmit { focus = .password }
                    SecureField("Password", text: $password)
                        .textContentType(.password).submitLabel(.go).focused($focus, equals: .password).onSubmit(signIn)
                } footer: {
                    Text("Forgot it? Use Forgot password on the website's sign-in page.")
                }
                Section {
                    Button(busy ? "Signing in…" : "Sign in", action: signIn).disabled(busy || email.isEmpty || password.isEmpty)
                }
            }
            if let error { Section { Notice(text: error, kind: .bad) } }
        }
        .navigationTitle("Sign in")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { focus = model.pendingChallenge == nil ? .email : .code }
        .onDisappear { if model.credentials == nil { model.cancelChallenge() } }
    }

    private func signIn() {
        guard !email.isEmpty, !password.isEmpty else { return }
        run { try await model.signIn(email: email, password: password, server: server) }
    }

    private func run(_ work: @escaping @MainActor () async throws -> Void) {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch { self.error = error.localizedDescription }
        }
    }
}

// MARK: - Invite code

private struct InviteView: View {
    let server: URL
    @Environment(AppModel.self) private var model
    @State private var code = ""
    @State private var password = ""
    @State private var confirm = ""
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?

    enum Field { case code, password, confirm }

    var body: some View {
        Form {
            Section {
                TextField("Invite code", text: $code, prompt: Text("K7QM-2XRA-9TPD"))
                    .textInputAutocapitalization(.characters).autocorrectionDisabled().font(.title3.monospaced())
                    .submitLabel(.next).focused($focus, equals: .code).onSubmit { focus = .password }
            } footer: {
                Text("From your invite email, or from whoever runs your AthleteOS. It works once.")
            }
            Section {
                SecureField("New password", text: $password)
                    .textContentType(.newPassword).submitLabel(.next).focused($focus, equals: .password).onSubmit { focus = .confirm }
                SecureField("Same password again", text: $confirm)
                    .textContentType(.newPassword).submitLabel(.join).focused($focus, equals: .confirm).onSubmit(redeem)
            } footer: {
                Text("At least \(InviteCode.minPasswordLength) characters. It also signs you in on the website.")
            }
            Section {
                Button(busy ? "Joining…" : "Join", action: redeem)
                    .disabled(busy || InviteCode.normalize(code) == nil || password.isEmpty)
            }
            if let error { Section { Notice(text: error, kind: .bad) } }
        }
        .navigationTitle("Invite code")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear {
            if let linked = model.pendingInviteCode { code = linked; model.pendingInviteCode = nil; focus = .password }
            else if code.isEmpty { focus = .code }
        }
        .onChange(of: model.pendingInviteCode) { _, linked in
            if let linked { code = linked; model.pendingInviteCode = nil; focus = .password }
        }
    }

    /// Length and match are checked here so a typo doesn't spend the single-use code.
    private func redeem() {
        guard password.count >= InviteCode.minPasswordLength else { error = "Choose a password of at least \(InviteCode.minPasswordLength) characters."; return }
        guard password == confirm else { error = "The two passwords don't match."; return }
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await model.redeem(code: code, password: password, server: server) } catch { self.error = error.localizedDescription }
        }
    }
}

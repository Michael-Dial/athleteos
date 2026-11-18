import AthleteKit
import SwiftUI

struct MoreView: View {
    let client: APIClient
    let credentials: Credentials
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false
    // The role comes from the server each time, so a demoted admin loses the row.
    @State private var isAdmin = false

    var body: some View {
        List {
            Section {
                LabeledContent("Signed in as", value: credentials.athleteName)
                LabeledContent("Server", value: credentials.server.host() ?? credentials.server.absoluteString)
            }
            Section {
                NavigationLink { AccountsView(client: client) } label: { Label("Connected accounts", systemImage: "link") }
                NavigationLink { CheckInsView(client: client) } label: { Label("Check-ins", systemImage: "checklist") }
            }
            if isAdmin {
                Section("Admin") {
                    NavigationLink { ServicesView(client: client) } label: { Label("Service status", systemImage: "antenna.radiowaves.left.and.right") }
                }
            }
            Section {
                Button("Sign out", role: .destructive) { confirmSignOut = true }
                NavigationLink { DeleteAccountView() } label: { Text("Delete account").foregroundStyle(Palette.bad) }
            } footer: {
                Text("AthleteOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""))")
            }
        }
        .navigationTitle("More")
        .task { if let me = try? await client.getMe() { isAdmin = me.user.role == .admin } }
        .confirmationDialog("Sign out of AthleteOS on this phone?", isPresented: $confirmSignOut, titleVisibility: .visible) {
            Button("Sign out", role: .destructive) { Task { await model.signOut() } }
        } message: {
            Text("Apple Health sync on this phone stops. You can sign in again with your email and password.")
        }
    }
}

/// Every active questionnaire, with today's due ones first; any can be filled in for today.
struct CheckInsView: View {
    let client: APIClient

    var body: some View {
        LoadingView(load: { try await client.getQuestionnaires() }) { q in
            let today = Fmt.localDay(Date())
            List {
                ForEach(q.questionnaires.filter(\.active).sorted { $0.due && !$1.due }, id: \.slug) { d in
                    NavigationLink(value: CheckInRoute(slug: d.slug, date: today)) {
                        VStack(alignment: .leading, spacing: 2) {
                            HStack {
                                Text(d.name).font(.body.weight(.medium))
                                if d.due { StateBadge(text: "Due", color: Palette.accentText) }
                            }
                            Text([d.schedule.rawValue.capitalized, d.streakDays.map { "\(Int($0))-day streak" }, d.lastAnswered.map { "last \(Fmt.shortDay($0))" }]
                                .compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            .navigationDestination(for: CheckInRoute.self) { CheckInView(client: client, slug: $0.slug, date: $0.date) }
        }
        .navigationTitle("Check-ins")
    }
}

/// Deleting your own account, as the App Store requires of an app that creates
/// them. The server asks for the password again and deletes everything; this
/// phone then signs out and stops Apple Health sync.
struct DeleteAccountView: View {
    @Environment(AppModel.self) private var model
    @State private var password = ""
    @State private var confirming = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        Form {
            Section {
                Text("This deletes your sign-in, plan, check-ins, settings and the device data synced to AthleteOS, and disconnects your wearables from it.")
                Text("Your watch and ring makers, and Apple Health, keep their own copies. This can't be undone.").foregroundStyle(.secondary)
            }
            Section {
                SecureField("Your password", text: $password).textContentType(.password).submitLabel(.done)
            } footer: {
                Text("Asked again so a phone left unlocked can't delete your account.")
            }
            if let error { Section { Notice(text: error, kind: .bad) } }
            Section {
                Button(busy ? "Deleting…" : "Delete account", role: .destructive) { confirming = true }
                    .disabled(busy || password.isEmpty)
            }
        }
        .navigationTitle("Delete account")
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Delete your AthleteOS account and all its data?", isPresented: $confirming, titleVisibility: .visible) {
            Button("Delete account", role: .destructive, action: delete)
        } message: {
            Text("This can't be undone.")
        }
    }

    private func delete() {
        busy = true; error = nil
        Task {
            defer { busy = false }
            do { try await model.deleteAccount(password: password) } catch { self.error = error.localizedDescription }
        }
    }
}

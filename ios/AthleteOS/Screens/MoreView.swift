import AthleteKit
import SwiftUI

struct MoreView: View {
    let client: APIClient
    let credentials: Credentials
    @Environment(AppModel.self) private var model
    @State private var confirmSignOut = false

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
            Section {
                Button("Sign out", role: .destructive) { confirmSignOut = true }
            } footer: {
                Text("AthleteOS \(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "") (\(Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? ""))")
            }
        }
        .navigationTitle("More")
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

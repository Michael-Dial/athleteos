import AthleteKit
import SwiftUI

/// Admin only: test the services the server depends on with the settings it
/// already has. Nothing typed here reaches them, which is why no password is
/// asked for; changing the settings stays on the web, where it is.
struct ServicesView: View {
    let client: APIClient

    var body: some View {
        LoadingView(load: { try await client.getAdminServices() }) { r in
            List {
                ForEach(r.services, id: \.id) { ServiceRow(client: client, service: $0) }
                Section {
                } footer: {
                    Text("Tests use the settings saved on the server. To change them, open Settings → Credentials on the web.")
                }
            }
        }
        .navigationTitle("Service status")
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct ServiceRow: View {
    let client: APIClient
    let service: AdminServicesResponse.Service
    @State private var testing = false
    @State private var result: AdminServicesByServiceTestPostResponse?
    @State private var error: String?

    var body: some View {
        Section {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(service.name).font(.body.weight(.medium))
                    Text(service.target ?? "Not set up").font(.caption).foregroundStyle(.secondary).lineLimit(1).truncationMode(.middle)
                }
                Spacer()
                if testing {
                    ProgressView()
                } else {
                    Button("Test", action: test).buttonStyle(.bordered).disabled(!service.configured)
                }
            }
            if let result {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(result.message)
                        Text("\(Int(result.durationMs)) ms · \(Fmt.instant(result.testedAt)?.formatted(date: .omitted, time: .standard) ?? "")")
                            .foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: result.ok ? "checkmark.circle.fill" : "xmark.octagon.fill")
                        .foregroundStyle(result.ok ? Palette.good : Palette.bad)
                }
                .font(.footnote)
                .accessibilityLabel("\(result.ok ? "Working" : "Failed"): \(result.message)")
            }
            if let error { Notice(text: error, kind: .bad) }
        }
    }

    private func test() {
        testing = true; error = nil
        Task {
            defer { testing = false }
            do { result = try await client.postAdminServicesByServiceTest(service: service.id.rawValue) }
            catch { self.error = error.localizedDescription }
        }
    }
}

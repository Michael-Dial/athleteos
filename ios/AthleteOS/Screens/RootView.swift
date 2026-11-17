import AthleteKit
import SwiftUI

struct RootView: View {
    @Environment(AppModel.self) private var model
    @Environment(\.scenePhase) private var phase

    var body: some View {
        Group {
            if let client = model.client, let credentials = model.credentials {
                TabView {
                    Tab("Today", systemImage: "sun.max") { NavigationStack { TodayView(client: client) } }
                    Tab("Training", systemImage: "figure.run") { NavigationStack { TrainingView(client: client) } }
                    Tab("Plan", systemImage: "calendar") { NavigationStack { PlanView(client: client) } }
                    Tab("Trends", systemImage: "chart.xyaxis.line") { NavigationStack { TrendsView(client: client) } }
                    Tab("More", systemImage: "ellipsis.circle") { NavigationStack { MoreView(client: client, credentials: credentials) } }
                }
                // A new athlete per sign-in: every tab starts fresh rather than showing the last person's data.
                .id(credentials.athleteKey + String(credentials.tokenId))
            } else {
                SignInView()
            }
        }
        .task { await model.reconcileSync() }
        .onChange(of: phase) { _, p in if p == .active { Task { await model.reconcileSync() } } }
    }
}

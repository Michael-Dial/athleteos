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
                // Over the tabs, so finishing setup lands on Today with whatever it connected already loading.
                .fullScreenCover(isPresented: Binding(get: { model.setup != nil }, set: { _ in })) {
                    if let plan = model.setup { SetupFlow(client: client, plan: plan) }
                }
            } else {
                SignInView()
            }
        }
        // Sync state first: setup skips the Apple Health step when this phone already syncs.
        .task { await model.reconcileSync(); await model.planSetup() }
        .onChange(of: phase) { _, p in if p == .active { Task { await model.reconcileSync() } } }
        .onOpenURL { model.open($0) }
    }
}

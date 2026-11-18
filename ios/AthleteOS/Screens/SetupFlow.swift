import AthleteKit
import AuthenticationServices
import SwiftUI

/// First-run setup, full screen over the tabs after the first sign-in on this
/// phone: one task per step, every step skippable, Back keeps what was done.
/// Apple Health is asked for on its own step, after saying what it reads, and
/// the app works the same if it's declined. Steps the account already finished
/// on the web are left out (see AppModel.planSetup).
struct SetupFlow: View {
    let client: APIClient
    let plan: SetupPlan
    @Environment(AppModel.self) private var model
    @State private var index = 0

    private var steps: [SetupStep] { plan.steps }
    private var step: SetupStep { steps[min(index, steps.count - 1)] }

    var body: some View {
        VStack(spacing: 0) {
            topBar
            Group {
                switch step {
                case .welcome: WelcomeStep(firstName: plan.firstName, next: next)
                case .health: HealthStep(next: next)
                case .wearables: WearablesStep(client: client, next: next)
                case .checkIn: CheckInStep(client: client, date: plan.today, next: next)
                case .done: DoneStep(healthOn: model.sync == .syncing) { Task { await model.finishSetup() } }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .id(step)
            .transition(.opacity)
        }
        .animation(.default, value: index)
        .interactiveDismissDisabled()
    }

    private var topBar: some View {
        HStack {
            if index > 0 {
                Button { index -= 1 } label: { Label("Back", systemImage: "chevron.backward").labelStyle(.titleAndIcon) }
                    .frame(minWidth: 44, minHeight: 44, alignment: .leading)
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
            Spacer()
            StepDots(count: steps.count, current: index)
            Spacer()
            if step != .done {
                Button("Skip") { Task { await model.finishSetup() } }
                    .frame(minWidth: 44, minHeight: 44, alignment: .trailing)
                    .accessibilityLabel("Skip setup")
                    .accessibilityHint("You can do all of this later from More")
            } else {
                Color.clear.frame(width: 44, height: 44)
            }
        }
        .padding(.horizontal, 16)
    }

    private func next() { if index < steps.count - 1 { index += 1 } }
}

private struct StepDots: View {
    let count: Int
    let current: Int

    var body: some View {
        HStack(spacing: 6) {
            ForEach(0..<count, id: \.self) { i in
                Capsule()
                    .fill(i == current ? Palette.accentText : Color(.tertiaryLabel))
                    .frame(width: i == current ? 18 : 6, height: 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel("Step \(current + 1) of \(count)")
    }
}

/// A step's text in a scroll view, its actions pinned above the home indicator.
private struct StepLayout<Content: View, Actions: View>: View {
    let symbol: String?
    let title: String
    @ViewBuilder let content: Content
    @ViewBuilder let actions: Actions

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                if let symbol {
                    Image(systemName: symbol)
                        .font(.system(size: 44, weight: .regular))
                        .foregroundStyle(Palette.accentText)
                        .accessibilityHidden(true)
                }
                Text(title).font(.largeTitle.weight(.bold)).fixedSize(horizontal: false, vertical: true)
                content
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)
            .padding(.bottom, 24)
            .frame(maxWidth: 560, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .scrollBounceBehavior(.basedOnSize)
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 8) { actions }
                .padding(.horizontal, 24)
                .padding(.vertical, 12)
                .frame(maxWidth: 560)
                .frame(maxWidth: .infinity)
                .background(.bar)
        }
    }
}

// MARK: - Steps

private struct WelcomeStep: View {
    let firstName: String
    let next: () -> Void

    var body: some View {
        StepLayout(symbol: nil, title: "Welcome, \(firstName)") {
            Text("A couple of minutes here and AthleteOS starts learning what's normal for you.")
                .font(.title3).foregroundStyle(.secondary)
            VStack(alignment: .leading, spacing: 20) {
                ValueRow(symbol: "gauge.with.needle", title: "Ready or back off, each morning", detail: "HRV, resting heart rate, sleep and how you feel, against your own normal ranges.")
                ValueRow(symbol: "calendar", title: "Plan against what you did", detail: "Sessions from every device, counted once.")
                ValueRow(symbol: "applewatch", title: "Every number names its device", detail: "So a new watch never looks like a change in you.")
            }
            .padding(.top, 4)
            Text("Every step can be skipped and changed later under More.").font(.footnote).foregroundStyle(.secondary)
        } actions: {
            Button("Get started", action: next).buttonStyle(PrimaryButtonStyle())
        }
    }
}

private struct HealthStep: View {
    let next: () -> Void
    @Environment(AppModel.self) private var model
    @State private var busy = false
    @State private var tried = false

    var body: some View {
        StepLayout(symbol: "heart.text.square", title: "Apple Health") {
            Text("AthleteOS reads heart rate variability, resting heart rate, sleep and workouts from Apple Health, including what an Apple Watch records.")
            Text("It sends the last 30 days, so readiness can start sooner, then keeps syncing in the background. It never writes to Apple Health.")
                .foregroundStyle(.secondary)
            if model.sync == .syncing {
                Label("Apple Health is on", systemImage: "checkmark.circle.fill").foregroundStyle(Palette.good).font(.headline)
            }
            if let m = model.syncMessage, tried { Notice(text: m, kind: .bad) }
            Text("iPhone asks which data to share next. You can change that in the Health app, or turn sync off under More → Connected accounts.")
                .font(.footnote).foregroundStyle(.secondary)
        } actions: {
            if model.sync == .syncing {
                Button("Continue", action: next).buttonStyle(PrimaryButtonStyle())
            } else {
                Button(busy ? "Waiting for iPhone…" : "Turn on Apple Health") {
                    busy = true
                    Task {
                        await model.turnOnAppleHealth()
                        busy = false
                        tried = true
                        if model.sync == .syncing { next() }
                    }
                }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(busy)
                Button("Not now", action: next).frame(minHeight: 44).disabled(busy)
            }
        }
    }
}

private struct WearablesStep: View {
    let client: APIClient
    let next: () -> Void
    @State private var reload = 0
    @State private var busy: String?
    @State private var message: String?
    @State private var connected = false
    @State private var auth = WebAuth()

    var body: some View {
        StepLayout(symbol: "applewatch.radiowaves.left.and.right", title: "Connect your wearables") {
            Text("Garmin, Oura and the others sync from their own accounts. You sign in on the maker's site and come straight back.")
                .foregroundStyle(.secondary)
            LoadingView(load: { try await client.getAccounts() }) { a in
                let cloud = a.services.filter { $0.kind == .cloud }
                VStack(spacing: 0) {
                    if cloud.isEmpty {
                        Text("No wearable accounts can be connected on this server yet.")
                            .foregroundStyle(.secondary).padding(16).frame(maxWidth: .infinity, alignment: .leading)
                    }
                    ForEach(Array(cloud.enumerated()), id: \.element.provider) { i, s in
                        if i > 0 { Divider().padding(.leading, 16) }
                        ServiceRow(name: s.name, connected: s.status == .connected, busy: busy == s.provider, disabled: busy != nil) {
                            connect(s.provider, s.name)
                        }
                    }
                }
                .background(Color(.secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .onAppear { connected = a.services.contains { $0.kind == .cloud && $0.status == .connected } }
            }
            .id(reload)
            // LoadingView fills the screen while it loads; inside a scrolling step it needs a floor.
            .frame(minHeight: 120)
            if let message { Notice(text: message, kind: .info) }
        } actions: {
            if connected {
                Button("Continue", action: next).buttonStyle(PrimaryButtonStyle())
            } else {
                Button("Skip for now", action: next).buttonStyle(SecondaryButtonStyle())
            }
        }
        .background(Color(.systemGroupedBackground))
    }

    private func connect(_ provider: String, _ name: String) {
        busy = provider; message = nil
        Task {
            defer { busy = nil }
            do {
                let r = try await client.postAccountsByProviderConnect(provider: provider, body: .init(returnTo: .app))
                guard let url = URL(string: r.authorizationUrl) else { return }
                _ = try await auth.start(url: url, callbackScheme: "athleteos")
                message = "\(name) is connected. Its data arrives after the first sync, usually within a few minutes."
                connected = true
                reload += 1
            } catch let e as ASWebAuthenticationSessionError where e.code == .canceledLogin {
            } catch { message = error.localizedDescription }
        }
    }
}

private struct ServiceRow: View {
    let name: String
    let connected: Bool
    let busy: Bool
    let disabled: Bool
    let connect: () -> Void

    var body: some View {
        ViewThatFits(in: .horizontal) {
            HStack {
                label
                Spacer()
                action
            }
            VStack(alignment: .leading, spacing: 8) {
                label
                action
            }
        }
        .padding(.horizontal, 16).padding(.vertical, 10)
        .frame(minHeight: 52)
    }

    private var label: some View { Text(name).font(.body.weight(.medium)) }

    @ViewBuilder private var action: some View {
        if connected {
            Label("Connected", systemImage: "checkmark.circle.fill").foregroundStyle(Palette.good).font(.subheadline)
        } else {
            Button(busy ? "Opening…" : "Connect", action: connect).buttonStyle(.bordered).disabled(disabled)
                .accessibilityLabel("Connect \(name)")
        }
    }
}

private struct CheckInStep: View {
    let client: APIClient
    let date: String
    let next: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Your first check-in").font(.largeTitle.weight(.bold))
                .padding(.horizontal, 24).padding(.top, 16).padding(.bottom, 4)
                .frame(maxWidth: .infinity, alignment: .leading)
            CheckInView(client: client, slug: "morning-wellness", date: date,
                        intro: "Five quick answers each morning: fatigue, sleep, soreness, stress and mood. It's one of the five things readiness weighs, and the only one no device can measure.",
                        onDone: next)
        }
        .background(Color(.systemGroupedBackground))
        .safeAreaInset(edge: .bottom) {
            Button("Not now", action: next).frame(maxWidth: .infinity, minHeight: 44).padding(.vertical, 4).background(.bar)
        }
    }
}

private struct DoneStep: View {
    let healthOn: Bool
    let finish: () -> Void

    var body: some View {
        StepLayout(symbol: "checkmark.seal", title: "You're set") {
            Text("Readiness compares each morning with your own recent normal, so it needs about a week of your data before it says whether today is unusual.")
            Text(healthOn ? "Apple Health is sending its last 30 days now, which may cover that already." : "Until then, Today shows what came in and what's still building.")
                .foregroundStyle(.secondary)
            Text("Connected accounts, check-ins and Apple Health are all under More.").font(.footnote).foregroundStyle(.secondary)
        } actions: {
            Button("Go to Today", action: finish).buttonStyle(PrimaryButtonStyle())
        }
    }
}

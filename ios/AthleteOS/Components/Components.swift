import AthleteKit
import SwiftUI

/// A screen's data: loading, loaded, or failed with the server's own message.
enum Loadable<T> {
    case loading
    case loaded(T)
    case failed(String)
}

/// Loads with `load` on appear and on pull-to-refresh; shows a spinner only on the first load.
struct LoadingView<T, Content: View>: View {
    let load: () async throws -> T
    @ViewBuilder let content: (T) -> Content
    @State private var state: Loadable<T> = .loading

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity)
            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't load this", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Try again") { Task { await run() } }.buttonStyle(.borderedProminent)
                }
            case .loaded(let value):
                content(value)
            }
        }
        .task { await run() }
        .refreshable { await run() }
    }

    private func run() async {
        do { state = .loaded(try await load()) }
        catch is CancellationError {}
        catch { if case .loaded = state {} else { state = .failed(error.localizedDescription) } }
    }
}

/// Which device a number came from. Every device number on screen carries one.
struct SourceChip: View {
    let name: String
    var fallback = false

    var body: some View {
        Label(fallback ? "\(name) · fallback" : name, systemImage: "applewatch")
            .labelStyle(.titleAndIcon)
            .font(.caption2)
            .foregroundStyle(.secondary)
            .accessibilityLabel(fallback ? "From \(name), used because the preferred device had no data" : "From \(name)")
    }
}

struct Notice: View {
    let text: String
    var kind: Kind = .warn
    enum Kind { case warn, bad, info }

    var body: some View {
        Label(text, systemImage: kind == .info ? "info.circle" : "exclamationmark.triangle")
            .font(.footnote)
            .foregroundStyle(kind == .bad ? Palette.bad : kind == .warn ? Palette.warn : .secondary)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// A traffic-light dot with a word, for readiness pillars and statuses.
struct StateBadge: View {
    let text: String
    let color: Color

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(color.opacity(0.16), in: Capsule())
            .foregroundStyle(color)
    }
}

/// A big number with its unit and label.
struct Metric: View {
    let label: String
    let value: String
    var unit: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label).font(.caption).foregroundStyle(.secondary)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(value).font(.title3.weight(.semibold)).monospacedDigit()
                if let unit { Text(unit).font(.caption).foregroundStyle(.secondary) }
            }
        }
        .accessibilityElement(children: .combine)
    }
}

extension TodayResponse.Readiness.Overall {
    var color: Color {
        switch self {
        case .green: Palette.good
        case .amber: Palette.warn
        case .red: Palette.bad
        default: .secondary
        }
    }

    var word: String {
        switch self {
        case .green: "Ready"
        case .amber: "Caution"
        case .red: "Back off"
        default: "Not enough data"
        }
    }
}

/// The pillar states the server sends: ok / watch / flag / nodata.
func stateColor(_ raw: String) -> Color {
    switch raw {
    case "ok": Palette.good
    case "watch": Palette.warn
    case "flag": Palette.bad
    default: .secondary
    }
}

func stateWord(_ raw: String) -> String {
    switch raw {
    case "ok": "Normal"
    case "watch": "Watch"
    case "flag": "Flag"
    default: "No data"
    }
}

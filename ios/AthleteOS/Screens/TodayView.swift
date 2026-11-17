import AthleteKit
import Charts
import SwiftUI

struct TodayView: View {
    let client: APIClient

    var body: some View {
        LoadingView(load: { try await client.getToday() }) { t in
            List {
                Section { ReadinessHeader(r: t.readiness) }
                if !t.readiness.errors.isEmpty {
                    Section { ForEach(t.readiness.errors, id: \.self) { Notice(text: $0, kind: .bad) } }
                }
                if !t.checkIn.due.isEmpty {
                    Section("Check-in") {
                        ForEach(t.checkIn.due, id: \.slug) { d in
                            NavigationLink(value: CheckInRoute(slug: d.slug, date: t.date)) {
                                Label("\(d.name) is due", systemImage: "checklist").foregroundStyle(Palette.accentText)
                            }
                        }
                    }
                }
                Section("Readiness") {
                    HrvRow(h: t.readiness.hrv)
                    PillarRow(title: "Resting heart rate", state: t.readiness.restingHr.state.rawValue, note: t.readiness.restingHr.note,
                              detail: zLine(t.readiness.restingHr.z, unit: "bpm"), device: t.readiness.restingHr.device.map { ($0.name, $0.fallback) })
                    PillarRow(title: "Sleep", state: t.readiness.sleep.state.rawValue, note: t.readiness.sleep.note,
                              detail: t.readiness.sleep.z.map { "\(Fmt.duration(minutes: $0.value)) vs usual \(Fmt.duration(minutes: $0.mean))" },
                              device: t.readiness.sleep.device.map { ($0.name, $0.fallback) })
                    PillarRow(title: "Wellness", state: t.readiness.wellness.state.rawValue, note: t.readiness.wellness.note,
                              detail: t.readiness.wellness.composite.map { "Composite \(Fmt.number($0, digits: 1))" }, device: nil)
                    PillarRow(title: "Training load", state: t.readiness.load.state.rawValue, note: t.readiness.load.note,
                              detail: "ACWR \(Fmt.number(t.readiness.load.acwr, digits: 2)) · this week \(Fmt.number(t.readiness.load.weekLoad))", device: nil)
                }
                LastNightSection(lastNight: t.lastNight)
                Section("Today's plan") {
                    if t.plan.isEmpty { Text("Nothing planned today.").foregroundStyle(.secondary) }
                    ForEach(t.plan, id: \.id) { PlanSessionRow(title: $0.title, sport: $0.sport, status: $0.status.rawValue, minutes: $0.plannedDurationMin, km: $0.plannedDistanceKm, intensity: $0.intensity) }
                }
            }
            .navigationDestination(for: CheckInRoute.self) { CheckInView(client: client, slug: $0.slug, date: $0.date) }
        }
        .navigationTitle("Today")
    }

    private func zLine(_ z: TodayResponse.Readiness.RestingHr.Z?, unit: String) -> String? {
        guard let z, let v = z.value else { return nil }
        return "\(Fmt.number(v)) \(unit) vs usual \(Fmt.number(z.mean)) (z \(Fmt.signed(z.z)))"
    }
}

struct CheckInRoute: Hashable { let slug: String; let date: String }

private struct ReadinessHeader: View {
    let r: TodayResponse.Readiness

    var body: some View {
        HStack(alignment: .center, spacing: 16) {
            Circle().fill(r.overall.color).frame(width: 44, height: 44)
                .overlay(Image(systemName: r.overall == .green ? "checkmark" : r.overall == .red ? "arrow.down" : "minus").font(.headline).foregroundStyle(.white))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                Text(r.overall.word).font(.title2.weight(.bold))
                Text(r.index.map { "Index \(Fmt.signed($0, digits: 2)), mean z across pillars" } ?? "Not enough recent data for an index")
                    .font(.footnote).foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .combine)
    }
}

/// HRV shown both ways: raw RMSSD in ms and its log, since aggregates are computed on ln(RMSSD).
private struct HrvRow: View {
    let h: TodayResponse.Readiness.Hrv

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("HRV").font(.headline)
                Spacer()
                StateBadge(text: stateWord(h.state.rawValue), color: stateColor(h.state.rawValue))
            }
            HStack(spacing: 20) {
                Metric(label: "Last night", value: Fmt.number(h.lastNightMs), unit: "ms")
                Metric(label: "ln", value: Fmt.number(h.lastNightLn, digits: 2))
                Metric(label: "7-day ln", value: Fmt.number(h.rollingLn, digits: 2))
                Metric(label: "7-day", value: Fmt.number(h.rollingMs), unit: "ms")
            }
            if let lo = h.normalLowLn, let hi = h.normalHighLn {
                Text("Normal range ln \(Fmt.number(lo, digits: 2))–\(Fmt.number(hi, digits: 2)) · CV \(Fmt.number(h.rollingCvPct, digits: 1))%")
                    .font(.caption).foregroundStyle(.secondary)
            }
            let pts = h.series.filter { $0.rollingLn != nil }
            if pts.count > 1 {
                Chart {
                    ForEach(h.series, id: \.date) { p in
                        if let lo = p.normalLowLn, let hi = p.normalHighLn, let d = Fmt.day(p.date) {
                            AreaMark(x: .value("Day", d), yStart: .value("Low", lo), yEnd: .value("High", hi))
                                .foregroundStyle(Palette.good.opacity(0.15))
                        }
                        if let v = p.rollingLn, let d = Fmt.day(p.date) {
                            LineMark(x: .value("Day", d), y: .value("7-day ln RMSSD", v)).foregroundStyle(Palette.accentText)
                        }
                        if let v = p.ln, let d = Fmt.day(p.date) {
                            PointMark(x: .value("Day", d), y: .value("ln RMSSD", v)).symbolSize(12).foregroundStyle(.secondary)
                        }
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .frame(height: 120)
                .accessibilityLabel("Seven-day mean of ln RMSSD against its normal range")
            }
            if let note = h.note { Text(note).font(.footnote).foregroundStyle(.secondary) }
            if let d = h.device { SourceChip(name: d.name, fallback: d.fallback) }
        }
        .padding(.vertical, 4)
    }
}

private struct PillarRow: View {
    let title: String
    let state: String
    let note: String?
    let detail: String?
    let device: (String, Bool)?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title).font(.headline)
                Spacer()
                StateBadge(text: stateWord(state), color: stateColor(state))
            }
            if let detail { Text(detail).font(.subheadline).monospacedDigit() }
            if let note { Text(note).font(.footnote).foregroundStyle(.secondary) }
            if let device { SourceChip(name: device.0, fallback: device.1) }
        }
        .padding(.vertical, 2)
    }
}

/// Last night per metric: the device your priority picked, and every other device beside it.
private struct LastNightSection: View {
    let lastNight: [String: TodayResponse.LastNight]
    struct NightMetric: Sendable { let key: String; let label: String; let unit: String; let digits: Int }
    private static let order = [
        NightMetric(key: "hrv", label: "HRV (RMSSD)", unit: "ms", digits: 0), NightMetric(key: "rhr", label: "Resting HR", unit: "bpm", digits: 0),
        NightMetric(key: "sleep", label: "Sleep", unit: "", digits: 0), NightMetric(key: "respiratory_rate", label: "Respiratory rate", unit: "br/min", digits: 1),
        NightMetric(key: "spo2", label: "SpO₂", unit: "%", digits: 0),
    ]

    var body: some View {
        Section("Last night") {
            ForEach(Self.order, id: \.key) { m in
                let n = lastNight[m.key]
                VStack(alignment: .leading, spacing: 4) {
                    HStack {
                        Text(m.label)
                        Spacer()
                        Text(n?.primary.map { value($0.value, m) } ?? Fmt.dash).monospacedDigit().font(.body.weight(.semibold))
                    }
                    if let p = n?.primary { SourceChip(name: p.device.name, fallback: p.fallback ?? false) }
                    ForEach(n?.others ?? [], id: \.device.key) { o in
                        HStack {
                            Text(o.device.name).font(.caption).foregroundStyle(.secondary)
                            Spacer()
                            Text(value(o.value, m)).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
    }

    private func value(_ v: Double, _ m: NightMetric) -> String {
        m.key == "sleep" ? Fmt.duration(minutes: v) : "\(Fmt.number(v, digits: m.digits)) \(m.unit)"
    }
}

struct PlanSessionRow: View {
    let title: String
    let sport: String
    let status: String
    let minutes: Double?
    let km: Double?
    let intensity: String?

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.body.weight(.medium))
                Text([sport.capitalized, minutes.map { Fmt.duration(minutes: $0) }, km.map { "\(Fmt.number($0, digits: 1)) km" }, intensity]
                    .compactMap { $0 }.joined(separator: " · "))
                    .font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            StateBadge(text: status.capitalized, color: status == "done" ? Palette.good : status == "missed" ? Palette.bad : .secondary)
        }
    }
}

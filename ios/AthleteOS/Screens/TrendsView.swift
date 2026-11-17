import AthleteKit
import Charts
import SwiftUI

/// Weekly trends. Device metrics are drawn per device, never merged: two
/// devices disagreeing is information, not noise to average away.
struct TrendsView: View {
    let client: APIClient
    @State private var weeks = 26

    var body: some View {
        LoadingView(load: { [weeks] in try await client.getTrends(query: [URLQueryItem(name: "weeks", value: String(weeks))]) }) { t in
            List {
                ForEach(t.owErrors, id: \.self) { Notice(text: $0, kind: .bad) }
                Section {
                    Chart(t.load, id: \.weekStart) { w in
                        if let d = Fmt.day(w.weekStart) { BarMark(x: .value("Week", d, unit: .weekOfYear), y: .value("Load", w.load)).foregroundStyle(Palette.accentText) }
                    }
                    .frame(height: 160)
                } header: {
                    Text("Weekly load")
                } footer: {
                    Text("Load from \(t.loadMethods.map { loadUnit($0) }.filter { !$0.isEmpty }.joined(separator: ", ")). Unrated sessions add nothing, so a quiet week may be an unrated one.")
                }
                DeviceTrend(title: "HRV", unit: "ms", note: "Weekly geometric mean of RMSSD (mean of ln RMSSD, back-transformed).", series: t.hrv.map { DeviceTrend.Series(device: $0.device.name, points: $0.points.map { DeviceTrend.Point(week: $0.weekStart, value: $0.value, cv: $0.cvPct) }) })
                DeviceTrend(title: "Resting heart rate", unit: "bpm", note: nil, series: t.rhr.map { DeviceTrend.Series(device: $0.device.name, points: $0.points.map { DeviceTrend.Point(week: $0.weekStart, value: $0.value, cv: $0.cvPct) }) })
                DeviceTrend(title: "Sleep", unit: "h", note: "Mean nightly sleep.", series: t.sleep.map { DeviceTrend.Series(device: $0.device.name, points: $0.points.map { DeviceTrend.Point(week: $0.weekStart, value: $0.value / 60, cv: nil) }) })
                DeviceTrend(title: "Body mass", unit: "kg", note: nil, series: t.bodyMass.map { DeviceTrend.Series(device: $0.device.name, points: $0.points.map { DeviceTrend.Point(week: $0.weekStart, value: $0.value, cv: nil) }) })
                DeviceTrend(title: "VO₂max", unit: "ml/kg/min", note: nil, series: t.vo2max.map { DeviceTrend.Series(device: $0.device.name, points: $0.points.map { DeviceTrend.Point(week: $0.weekStart, value: $0.value, cv: nil) }) })
            }
        }
        .id(weeks)
        .navigationTitle("Trends")
        .toolbar {
            Menu("Range", systemImage: "calendar") {
                Picker("Range", selection: $weeks) {
                    Text("12 weeks").tag(12); Text("26 weeks").tag(26); Text("52 weeks").tag(52)
                }
            }
        }
    }
}

private struct DeviceTrend: View {
    struct Point { let week: String; let value: Double; let cv: Double? }
    struct Series { let device: String; let points: [Point] }
    let title: String
    let unit: String
    let note: String?
    let series: [Series]

    var body: some View {
        if !series.isEmpty {
            Section {
                Chart {
                    ForEach(series, id: \.device) { s in
                        ForEach(s.points, id: \.week) { p in
                            if let d = Fmt.day(p.week) {
                                LineMark(x: .value("Week", d, unit: .weekOfYear), y: .value(title, p.value))
                                    .foregroundStyle(by: .value("Device", s.device))
                                    .symbol(by: .value("Device", s.device))
                            }
                        }
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .chartLegend(position: .bottom)
                .frame(height: 170)
                ForEach(series, id: \.device) { s in
                    if let last = s.points.last {
                        LabeledContent {
                            Text("\(Fmt.number(last.value, digits: unit == "h" || unit == "kg" ? 1 : 0)) \(unit)" + (last.cv.map { " · CV \(Fmt.number($0, digits: 1))%" } ?? ""))
                                .monospacedDigit()
                        } label: { SourceChip(name: s.device) }
                    }
                }
            } header: {
                Text(title)
            } footer: {
                if let note { Text(note) }
            }
        }
    }
}

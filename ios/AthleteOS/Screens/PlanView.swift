import AthleteKit
import SwiftUI

/// The plan a week at a time, with each session's status against what was done.
struct PlanView: View {
    let client: APIClient
    @State private var monday = PlanView.monday(of: Fmt.localDay(Date()))

    var body: some View {
        LoadingView(load: { [monday] in try await client.getPlan(query: [URLQueryItem(name: "start", value: monday), URLQueryItem(name: "end", value: Fmt.addDays(monday, 6))]) }) { p in
            List {
                if let e = p.owError { Section { Notice(text: e, kind: .bad) } }
                ForEach(p.phases, id: \.id) { ph in
                    Section {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(ph.name).font(.headline)
                            Text("\(ph.kind.capitalized) · \(Fmt.shortDay(ph.startDate)) – \(Fmt.shortDay(ph.endDate))").font(.caption).foregroundStyle(.secondary)
                            if let g = ph.goal { Text(g).font(.footnote) }
                        }
                    }
                }
                ForEach(0..<7, id: \.self) { i in
                    let day = Fmt.addDays(monday, i)
                    let sessions = p.sessions.filter { $0.date == day }
                    Section(Fmt.shortDay(day)) {
                        if sessions.isEmpty { Text("Rest or unplanned").foregroundStyle(.secondary) }
                        ForEach(sessions, id: \.id) { s in
                            VStack(alignment: .leading, spacing: 4) {
                                PlanSessionRow(title: s.title, sport: s.sport, status: s.status.rawValue, minutes: s.plannedDurationMin, km: s.plannedDistanceKm, intensity: s.intensity)
                                if let d = s.description { Text(d).font(.footnote).foregroundStyle(.secondary) }
                            }
                        }
                    }
                }
                if !p.unplannedKeys.isEmpty {
                    Section { Text("\(p.unplannedKeys.count) completed session\(p.unplannedKeys.count == 1 ? "" : "s") this week weren't in the plan.").font(.footnote).foregroundStyle(.secondary) }
                }
            }
        }
        .id(monday)
        .navigationTitle("Week of \(Fmt.shortDay(monday))")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button("Previous week", systemImage: "chevron.left") { monday = Fmt.addDays(monday, -7) }
                Button("This week", systemImage: "calendar.circle") { monday = PlanView.monday(of: Fmt.localDay(Date())) }
                Button("Next week", systemImage: "chevron.right") { monday = Fmt.addDays(monday, 7) }
            }
        }
    }

    /// Weeks start on Monday, as the server's do.
    static func monday(of day: String) -> String {
        guard let d = Fmt.day(day) else { return day }
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let weekday = cal.component(.weekday, from: d) // 1 = Sunday
        return Fmt.addDays(day, -((weekday + 5) % 7))
    }
}

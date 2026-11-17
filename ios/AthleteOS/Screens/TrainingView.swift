import AthleteKit
import SwiftUI

/// Completed work, newest first: device workouts and manual sessions, each
/// recording naming its device.
struct TrainingView: View {
    let client: APIClient
    @State private var weeks = 4
    @State private var reload = 0
    @State private var logging = false

    var body: some View {
        LoadingView(load: { try await client.getTraining(query: window) }) { t in
            List {
                if let e = t.owError { Section { Notice(text: e, kind: .bad) } }
                if t.sessions.isEmpty {
                    ContentUnavailableView("No sessions in this window", systemImage: "figure.run",
                                           description: Text("Workouts appear here once a connected account syncs them. You can also log one."))
                }
                ForEach(groupedByDay(t.sessions), id: \.day) { g in
                    Section(Fmt.shortDay(g.day)) {
                        ForEach(g.sessions, id: \.key) { s in
                            NavigationLink(value: s) { SessionRow(s: s) }
                        }
                    }
                }
                Section {
                    Button("Show \(weeks + 4) weeks") { weeks += 4; reload += 1 }
                }
            }
            .navigationDestination(for: TrainingResponse.Session.self) { SessionDetail(client: client, s: $0) }
        }
        .id(reload)
        .navigationTitle("Training")
        .toolbar { Button("Log session", systemImage: "plus") { logging = true } }
        .sheet(isPresented: $logging, onDismiss: { reload += 1 }) { NavigationStack { LogSessionView(client: client) } }
    }

    private var window: [URLQueryItem] {
        let end = Fmt.localDay(Date())
        return [URLQueryItem(name: "start", value: Fmt.addDays(end, -7 * weeks + 1)), URLQueryItem(name: "end", value: end)]
    }

    struct Day { let day: String; let sessions: [TrainingResponse.Session] }

    private func groupedByDay(_ s: [TrainingResponse.Session]) -> [Day] {
        Dictionary(grouping: s, by: \.date).map { Day(day: $0.key, sessions: $0.value) }.sorted { $0.day > $1.day }
    }
}

private struct SessionRow: View {
    let s: TrainingResponse.Session

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            HStack {
                Text(s.title).font(.body.weight(.medium))
                if s.excluded != nil { StateBadge(text: "Excluded", color: .secondary) }
                Spacer()
                if let l = s.load { Text("\(Fmt.number(l)) \(loadUnit(s.loadMethod?.rawValue))").font(.caption).monospacedDigit().foregroundStyle(.secondary) }
            }
            Text([Fmt.duration(minutes: s.durationMin), s.distanceKm.map { "\(Fmt.number($0, digits: 1)) km" }, s.avgHrBpm.map { "\(Fmt.number($0)) bpm" }, s.rpe.map { "RPE \(Fmt.number($0))" }]
                .compactMap { $0 }.joined(separator: " · "))
                .font(.caption).foregroundStyle(.secondary).monospacedDigit()
            ForEach(Array(Set(s.recordings.map(\.device.name))).sorted(), id: \.self) { SourceChip(name: $0) }
        }
    }
}

func loadUnit(_ method: String?) -> String {
    switch method {
    case "srpe": "AU"
    case "trimp": "TRIMP"
    case "duration": "min"
    default: ""
    }
}

private struct SessionDetail: View {
    let client: APIClient
    let s: TrainingResponse.Session
    @State private var rpe: Double?
    @State private var notes: String
    @State private var saving = false
    @State private var message: String?

    init(client: APIClient, s: TrainingResponse.Session) {
        self.client = client
        self.s = s
        _rpe = State(initialValue: s.rpe)
        _notes = State(initialValue: s.notes ?? "")
    }

    /// Ratings attach to the device workout; manual sessions are edited where they were logged.
    private var owWorkoutId: String? { s.recordings.first?.owWorkoutId }

    var body: some View {
        Form {
            Section("Summary") {
                LabeledContent("Sport", value: s.sport.capitalized)
                LabeledContent("Duration", value: Fmt.duration(minutes: s.durationMin))
                if let d = s.distanceKm { LabeledContent("Distance", value: "\(Fmt.number(d, digits: 2)) km") }
                if let h = s.avgHrBpm { LabeledContent("Average HR", value: "\(Fmt.number(h)) bpm") }
                if let h = s.maxHrBpm { LabeledContent("Max HR", value: "\(Fmt.number(h)) bpm") }
                LabeledContent("Load", value: s.load.map { "\(Fmt.number($0)) \(loadUnit(s.loadMethod?.rawValue))" } ?? "Not rated")
                if let e = s.excluded { LabeledContent("Excluded", value: e) }
            }
            if !s.recordings.isEmpty {
                Section("Recordings") {
                    ForEach(s.recordings, id: \.owWorkoutId) { r in
                        VStack(alignment: .leading, spacing: 2) {
                            SourceChip(name: r.device.name)
                            Text([r.type, Fmt.duration(minutes: r.durationMin), r.avgHrBpm.map { "\(Fmt.number($0)) bpm" }, r.avgPowerW.map { "\(Fmt.number($0)) W" }, r.caloriesKcal.map { "\(Fmt.number($0)) kcal" }]
                                .compactMap { $0 }.joined(separator: " · "))
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
            }
            if let owWorkoutId {
                Section {
                    Picker("RPE", selection: $rpe) {
                        Text("Not rated").tag(Double?.none)
                        ForEach(1...10, id: \.self) { Text("\($0)").tag(Double?.some(Double($0))) }
                    }
                    TextField("Notes", text: $notes, axis: .vertical).lineLimit(2...6)
                    Button(saving ? "Saving…" : "Save rating") { save(owWorkoutId) }.disabled(saving)
                } header: {
                    Text("How hard was it?")
                } footer: {
                    Text("Session RPE (1–10) × duration gives the session's load. Stored in AthleteOS; the device's own record is untouched.")
                }
            }
            if let message { Section { Notice(text: message, kind: .info) } }
        }
        .navigationTitle(s.title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func save(_ id: String) {
        saving = true; message = nil
        Task {
            defer { saving = false }
            do {
                try await client.patchTrainingWorkoutsByOwWorkoutId(owWorkoutId: id, body: .init(date: s.date, rpe: rpe, notes: notes.isEmpty ? nil : notes))
                message = "Saved."
            } catch { message = error.localizedDescription }
        }
    }
}

/// A session no device recorded: strength in the gym, a swim without a watch.
struct LogSessionView: View {
    let client: APIClient
    typealias Sport = TrainingManualPostBody.Sport
    @Environment(\.dismiss) private var dismiss
    @State private var date = Date()
    @State private var sport: Sport = .strength
    @State private var title = ""
    @State private var minutes = 45.0
    @State private var rpe: Double?
    @State private var notes = ""
    @State private var error: String?
    @State private var saving = false

    var body: some View {
        Form {
            DatePicker("Date", selection: $date, in: ...Date(), displayedComponents: .date)
            Picker("Sport", selection: $sport) {
                ForEach(Sport.allCases.filter { $0 != .unrecognized }, id: \.self) { Text($0.rawValue.capitalized).tag($0) }
            }
            TextField("Title (optional)", text: $title)
            Stepper("Duration: \(Int(minutes)) min", value: $minutes, in: 5...600, step: 5)
            Picker("RPE", selection: $rpe) {
                Text("Not rated").tag(Double?.none)
                ForEach(1...10, id: \.self) { Text("\($0)").tag(Double?.some(Double($0))) }
            }
            TextField("Notes", text: $notes, axis: .vertical)
            if let error { Notice(text: error, kind: .bad) }
        }
        .navigationTitle("Log session")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
            ToolbarItem(placement: .confirmationAction) { Button(saving ? "Saving…" : "Save", action: save).disabled(saving) }
        }
    }

    private func save() {
        saving = true; error = nil
        Task {
            defer { saving = false }
            do {
                // The picked day as the athlete sees it: their phone's calendar, not UTC.
                _ = try await client.postTrainingManual(body: .init(date: Fmt.localDay(date), sport: sport, title: title.isEmpty ? nil : title, durationMin: minutes, rpe: rpe, notes: notes.isEmpty ? nil : notes))
                dismiss()
            } catch { self.error = error.localizedDescription }
        }
    }
}

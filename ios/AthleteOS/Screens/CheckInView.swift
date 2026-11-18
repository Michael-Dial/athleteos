import AthleteKit
import SwiftUI

/// One questionnaire for one day, drawn from its definition. Opening a day
/// already answered shows those answers to edit. An unanswered item stays
/// unanswered: nothing defaults to zero or "no".
struct CheckInView: View {
    let client: APIClient
    let slug: String
    let date: String
    /// Shown above the questions, e.g. why first-run setup asks for this.
    var intro: String? = nil
    /// Called after saving instead of dismissing, when the form is a step inside another flow.
    var onDone: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    struct Loaded: Sendable { let def: QuestionnairesBySlugResponse; let existing: [String: JSONScalar] }

    var body: some View {
        LoadingView(load: load) { l in
            CheckInForm(client: client, def: l.def, date: date, initial: l.existing, intro: intro) { if let onDone { onDone() } else { dismiss() } }
        }
            .navigationTitle(Fmt.shortDay(date))
            .navigationBarTitleDisplayMode(.inline)
    }

    private func load() async throws -> Loaded {
        async let def = client.getQuestionnairesBySlug(slug: slug)
        async let prior = client.getQuestionnairesBySlugResponses(slug: slug, query: [URLQueryItem(name: "start", value: date), URLQueryItem(name: "end", value: date)])
        let (d, p) = try await (def, prior)
        return Loaded(def: d, existing: p.responses.first { $0.date == date }?.answers ?? [:])
    }
}

private struct CheckInForm: View {
    let client: APIClient
    let def: QuestionnairesBySlugResponse
    let date: String
    let intro: String?
    let done: () -> Void
    @State private var answers: [String: JSONScalar]
    @State private var saving = false
    @State private var error: String?

    init(client: APIClient, def: QuestionnairesBySlugResponse, date: String, initial: [String: JSONScalar], intro: String? = nil, done: @escaping () -> Void) {
        self.client = client
        self.intro = intro
        self.def = def
        self.date = date
        self.done = done
        _answers = State(initialValue: initial)
    }

    private var missing: [String] {
        def.items.filter { $0.required && answers[$0.key] == nil }.map(\.label)
    }

    var body: some View {
        Form {
            if let intro { Section { Text(intro).foregroundStyle(.secondary) } }
            else if let d = def.description { Section { Text(d).foregroundStyle(.secondary) } }
            ForEach(def.items, id: \.key) { item in
                Section {
                    ItemInput(item: item, value: binding(item.key))
                } header: {
                    Text(item.label + (item.required ? "" : " (optional)"))
                } footer: {
                    if let h = item.help { Text(h) }
                }
            }
            if let error { Section { Notice(text: error, kind: .bad) } }
            Section {
                Button(saving ? "Saving…" : "Save check-in", action: save)
                    .frame(maxWidth: .infinity)
                    .disabled(saving || !missing.isEmpty)
            } footer: {
                if !missing.isEmpty { Text("Still to answer: \(missing.joined(separator: ", "))") }
            }
        }
    }

    private func binding(_ key: String) -> Binding<JSONScalar?> {
        Binding(get: { answers[key] }, set: { answers[key] = $0 })
    }

    private func save() {
        saving = true; error = nil
        Task {
            defer { saving = false }
            do {
                _ = try await client.putQuestionnairesBySlugResponsesByDate(slug: def.slug, date: date, body: .init(answers: answers))
                done()
            } catch { self.error = error.localizedDescription }
        }
    }
}

private struct ItemInput: View {
    typealias Item = QuestionnairesBySlugResponse.Item
    let item: Item
    @Binding var value: JSONScalar?

    var body: some View {
        switch item.type {
        case .scale: scale
        case .number: number
        case .boolean: yesNo
        case .choice: choice
        case .text: text
        default: Text("This question needs a newer version of the app.").foregroundStyle(.secondary)
        }
    }

    /// Discrete steps as buttons: a slider has no "not answered" position.
    private var scale: some View {
        let lo = item.min ?? 1, hi = item.max ?? 5, step = max(item.step ?? 1, 0.5)
        let values = Array(stride(from: lo, through: hi, by: step))
        return VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                ForEach(values, id: \.self) { v in
                    let on = value?.number == v
                    Button(Fmt.number(v, digits: step < 1 ? 1 : 0)) { value = on && !item.required ? nil : .number(v) }
                        .buttonStyle(.bordered)
                        .tint(on ? Palette.accentText : .secondary)
                        .fontWeight(on ? .bold : .regular)
                        .accessibilityAddTraits(on ? .isSelected : [])
                }
            }
            if item.lowLabel != nil || item.highLabel != nil {
                HStack { Text(item.lowLabel ?? ""); Spacer(); Text(item.highLabel ?? "") }.font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    private var number: some View { NumberInput(unit: item.unit, value: $value) }

    private var yesNo: some View {
        Picker(item.label, selection: Binding(get: { value?.bool }, set: { value = $0.map(JSONScalar.bool) })) {
            Text("—").tag(Bool?.none)
            Text("Yes").tag(Bool?.some(true))
            Text("No").tag(Bool?.some(false))
        }
        .pickerStyle(.segmented)
        .labelsHidden()
    }

    private var choice: some View {
        Picker(item.label, selection: Binding(get: { value?.string }, set: { value = $0.map(JSONScalar.string) })) {
            Text("Choose…").tag(String?.none)
            ForEach(item.options ?? [], id: \.self) { Text($0).tag(String?.some($0)) }
        }
    }

    private var text: some View {
        TextField("Notes", text: Binding(get: { value?.string ?? "" }, set: { value = $0.isEmpty ? nil : .string($0) }), axis: .vertical)
            .lineLimit(2...6)
    }
}

/// Keeps what was typed ("7.") while it is being typed; the answer is the number it parses to, or none.
private struct NumberInput: View {
    let unit: String?
    @Binding var value: JSONScalar?
    @State private var text = ""

    var body: some View {
        HStack {
            TextField("Value", text: $text)
                .keyboardType(.decimalPad)
                .onChange(of: text) { _, s in
                    let t = s.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: ",", with: ".")
                    value = t.isEmpty ? nil : Double(t).map(JSONScalar.number)
                }
            if let unit { Text(unit).foregroundStyle(.secondary) }
        }
        // Plain digits, no grouping separators, so the prefilled text parses back to the same number.
        .onAppear { if text.isEmpty, let n = value?.number { text = n.rounded() == n ? String(Int(n)) : String(n) } }
    }
}

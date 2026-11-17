import Foundation

/// How numbers read in the app. Missing is a dash, never zero: "no data" and
/// "zero" are different facts.
public enum Fmt {
    public static let dash = "—"

    public static func number(_ v: Double?, digits: Int = 0) -> String {
        guard let v, v.isFinite else { return dash }
        return v.formatted(.number.precision(.fractionLength(digits)))
    }

    public static func signed(_ v: Double?, digits: Int = 1) -> String {
        guard let v, v.isFinite else { return dash }
        return (v > 0 ? "+" : "") + v.formatted(.number.precision(.fractionLength(digits)))
    }

    /// 5400 → "1 h 30 min", 2700 → "45 min".
    public static func duration(seconds: Double?) -> String {
        guard let s = seconds, s.isFinite, s >= 0 else { return dash }
        let m = Int((s / 60).rounded())
        return m >= 60 ? "\(m / 60) h \(m % 60) min" : "\(m) min"
    }

    public static func duration(minutes: Double?) -> String { duration(seconds: minutes.map { $0 * 60 }) }

    // Formatters are only read after creation; Foundation doesn't mark them Sendable.
    nonisolated(unsafe) private static let isoDay: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = TimeZone(identifier: "UTC")
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    /// The API's YYYY-MM-DD, which is already the athlete's local day: parsed as a calendar day, never shifted by time zone.
    public static func day(_ s: String) -> Date? { isoDay.date(from: s) }
    public static func dayString(_ d: Date) -> String { isoDay.string(from: d) }

    /// The day a moment falls on in the phone's own calendar and zone, as YYYY-MM-DD. For "today" and
    /// date pickers: after 7 pm in New York the UTC day is already tomorrow.
    public static func localDay(_ d: Date, calendar: Calendar = .current) -> String {
        let c = calendar.dateComponents([.year, .month, .day], from: d)
        return String(format: "%04d-%02d-%02d", c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }

    public static func addDays(_ s: String, _ n: Int) -> String {
        guard let d = day(s) else { return s }
        return dayString(d.addingTimeInterval(Double(n) * 86_400))
    }

    /// "Mon 17 Nov" for a YYYY-MM-DD.
    public static func shortDay(_ s: String) -> String {
        guard let d = day(s) else { return s }
        return d.formatted(Date.FormatStyle(timeZone: TimeZone(identifier: "UTC")!).weekday(.abbreviated).day().month(.abbreviated))
    }

    nonisolated(unsafe) private static let isoInstant: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    public static func instant(_ s: String?) -> Date? {
        guard let s else { return nil }
        return isoInstant.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    }

    public static func relative(_ s: String?) -> String {
        guard let d = instant(s) else { return "not yet" }
        return d.formatted(.relative(presentation: .named))
    }
}

import Foundation

/// An invite or password-reset code from Settings → Users, read off an email
/// or a message and typed on a phone. Mirrors the server's normalisation
/// (normalizeCode in src/lib/users.ts) so the app can say "that isn't a code"
/// before asking the server.
public enum InviteCode {
    static let alphabet = Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    public static let length = 12
    /// The server's minimum (MIN_PASSWORD_LENGTH in src/lib/signin.ts).
    public static let minPasswordLength = 12

    public static func normalize(_ input: String) -> String? {
        let s = input.uppercased()
            .filter { !$0.isWhitespace && $0 != "-" }
            .replacingOccurrences(of: "O", with: "0")
            .replacingOccurrences(of: "I", with: "1")
            .replacingOccurrences(of: "L", with: "1")
        guard s.count == length, s.allSatisfy({ alphabet.contains($0) }) else { return nil }
        let c = Array(s)
        return "\(String(c[0..<4]))-\(String(c[4..<8]))-\(String(c[8..<12]))"
    }
}

/// The AthleteOS server the app talks to. https only, except a local network
/// address for a server run at home during development.
public enum ServerAddress {
    public static let `default` = URL(string: "https://athleteos.dialedup.info")!

    public static func parse(_ input: String) -> URL? {
        var s = input.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.isEmpty { return nil }
        if !s.contains("://") { s = "https://\(s)" }
        guard var c = URLComponents(string: s), let host = c.host, !host.isEmpty else { return nil }
        let local = host == "localhost" || host.hasSuffix(".local") || host.hasPrefix("192.168.") || host.hasPrefix("10.") || host == "127.0.0.1"
        guard c.scheme == "https" || (c.scheme == "http" && local) else { return nil }
        c.path = c.path.hasSuffix("/") ? String(c.path.dropLast()) : c.path
        c.query = nil
        c.fragment = nil
        return c.url
    }
}

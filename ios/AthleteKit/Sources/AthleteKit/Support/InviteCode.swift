import Foundation

/// The admin's one-time code, read off a message and typed on a phone. Mirrors
/// the server's normalisation (src/lib/invite-code.ts) so the app can say
/// "that isn't a code" before asking the server, and accepts the
/// athleteos://invite/CODE link the admin can send instead.
public enum InviteCode {
    static let alphabet = Set("0123456789ABCDEFGHJKMNPQRSTVWXYZ")
    public static let length = 10

    public static func normalize(_ input: String) -> String? {
        let s = input.uppercased()
            .filter { !$0.isWhitespace && $0 != "-" }
            .replacingOccurrences(of: "O", with: "0")
            .replacingOccurrences(of: "I", with: "1")
            .replacingOccurrences(of: "L", with: "1")
        guard s.count == length, s.allSatisfy({ alphabet.contains($0) }) else { return nil }
        return "\(s.prefix(5))-\(s.suffix(5))"
    }

    /// athleteos://invite/7KQ2M-X9D4R, optionally with ?server=https://… for a server other than the default.
    public static func fromLink(_ url: URL) -> (code: String, server: URL?)? {
        guard url.scheme == "athleteos", url.host == "invite" else { return nil }
        guard let code = normalize(url.lastPathComponent) else { return nil }
        let server = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems?.first { $0.name == "server" }?.value.flatMap(ServerAddress.parse)
        return (code, server)
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

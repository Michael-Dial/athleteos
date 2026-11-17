import Foundation

/// What a signed-in phone keeps: which server, which athlete, and the API
/// token for this device. The token is the one thing that matters; the app
/// keeps all of it in the Keychain.
public struct Credentials: Codable, Hashable, Sendable {
    public var server: URL
    public var token: String
    public var tokenId: Int
    public var athleteId: Int
    public var athleteName: String

    public init(server: URL, token: String, tokenId: Int, athleteId: Int, athleteName: String) {
        self.server = server
        self.token = token
        self.tokenId = tokenId
        self.athleteId = athleteId
        self.athleteName = athleteName
    }

    /// Who the phone sync binding belongs to: an athlete on a server.
    public var athleteKey: String { "\(server.absoluteString)#\(athleteId)" }
}

public protocol SecureStorage: AnyObject, Sendable {
    func read(_ key: String) throws -> Data?
    func write(_ key: String, _ data: Data) throws
    func delete(_ key: String) throws
}

public final class CredentialStore: Sendable {
    let storage: SecureStorage
    static let key = "athleteos.credentials"

    public init(storage: SecureStorage) { self.storage = storage }

    public func load() -> Credentials? {
        guard let d = try? storage.read(Self.key) else { return nil }
        return try? JSONDecoder().decode(Credentials.self, from: d)
    }

    public func save(_ c: Credentials) throws { try storage.write(Self.key, try JSONEncoder().encode(c)) }
    public func clear() throws { try storage.delete(Self.key) }
}

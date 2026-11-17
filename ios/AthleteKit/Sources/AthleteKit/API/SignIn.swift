import Foundation

// Password sign-in answers either a token (201) or an emailed-code challenge
// (202), so it is written here rather than generated.

public struct GrantedToken: Codable, Hashable, Sendable {
    public let token: String
    public let id: Double
    public let name: String
    public let createdAt: String
}

public struct EmailChallenge: Codable, Hashable, Sendable {
    public let challengeId: String
    public let delivery: String
    public let destination: String
    public let expiresInSec: Double
}

public enum PasswordSignIn: Sendable {
    case signedIn(GrantedToken)
    case needsCode(EmailChallenge)
}

private struct TokenRequest: Encodable { let password: String; let name: String }

public extension APIClient {
    func postAuthToken(password: String, deviceName: String) async throws -> PasswordSignIn {
        let (data, status) = try await raw("POST", "/auth/token", body: try APIClient.encoder.encode(TokenRequest(password: password, name: deviceName)))
        if status == 202 { return .needsCode(try APIClient.decode(EmailChallenge.self, data, "/auth/token")) }
        return .signedIn(try APIClient.decode(GrantedToken.self, data, "/auth/token"))
    }
}

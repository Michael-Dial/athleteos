import Foundation

/// The server's error body, `{error: {code, message}}`. The message is written for the person and shown as is.
public struct APIError: Error, LocalizedError, Equatable, Sendable {
    public let status: Int
    public let code: String
    public let message: String

    public init(status: Int, code: String, message: String) {
        self.status = status
        self.code = code
        self.message = message
    }

    public var errorDescription: String? { message }
    /// The token was revoked or never existed: the app signs out rather than retrying.
    public var isUnauthorized: Bool { status == 401 && code == "unauthorized" }

    static let offline = APIError(status: 0, code: "offline", message: "Couldn't reach AthleteOS. Check your connection and try again.")
}

private struct ErrorBody: Decodable {
    struct Inner: Decodable { let code: String; let message: String }
    let error: Inner
}

/// AthleteOS's `/api/v1`, with the signed-in device's bearer token. The typed
/// methods (`getToday`, `putQuestionnairesBySlugResponsesByDate`, …) are
/// generated from the server's route table into Generated/API.swift.
public final class APIClient: Sendable {
    public let baseURL: URL
    private let token: String?
    private let session: URLSession
    /// Called on a 401 for a token the server no longer accepts.
    private let onUnauthorized: (@Sendable () -> Void)?

    public init(baseURL: URL, token: String?, session: URLSession = .shared, onUnauthorized: (@Sendable () -> Void)? = nil) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
        self.onUnauthorized = onUnauthorized
    }

    /// The same server with a token, after sign-in.
    public func with(token: String, onUnauthorized: (@Sendable () -> Void)? = nil) -> APIClient {
        APIClient(baseURL: baseURL, token: token, session: session, onUnauthorized: onUnauthorized)
    }

    /// A path parameter, escaped so a slug or date can't change the route.
    public static func segment(_ s: String) -> String {
        s.addingPercentEncoding(withAllowedCharacters: .alphanumerics.union(CharacterSet(charactersIn: "-._~"))) ?? s
    }

    // Configured once and only used after; not mutated, so shared across tasks.
    nonisolated(unsafe) static let encoder: JSONEncoder = { let e = JSONEncoder(); e.outputFormatting = [.sortedKeys]; return e }()
    nonisolated(unsafe) static let decoder = JSONDecoder()

    func request(_ method: String, _ path: String, query: [URLQueryItem], body: Data?) throws -> URLRequest {
        var c = URLComponents(url: baseURL.appendingPathComponent("api/v1"), resolvingAgainstBaseURL: false)!
        c.percentEncodedPath += path
        if !query.isEmpty { c.queryItems = query }
        var r = URLRequest(url: c.url!)
        r.httpMethod = method
        r.setValue("application/json", forHTTPHeaderField: "accept")
        if let token { r.setValue("Bearer \(token)", forHTTPHeaderField: "authorization") }
        if let body { r.httpBody = body; r.setValue("application/json", forHTTPHeaderField: "content-type") }
        r.timeoutInterval = 30
        return r
    }

    func raw(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data? = nil) async throws -> (Data, Int) {
        let req = try request(method, path, query: query, body: body)
        let data: Data, resp: URLResponse
        do { (data, resp) = try await session.data(for: req) }
        catch let e as URLError where e.code == .cancelled { throw CancellationError() }
        catch { throw APIError.offline }
        let status = (resp as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let e = (try? Self.decoder.decode(ErrorBody.self, from: data)).map { APIError(status: status, code: $0.error.code, message: $0.error.message) }
                ?? APIError(status: status, code: "http_\(status)", message: "AthleteOS answered with an error (\(status)). Try again shortly.")
            if e.isUnauthorized, token != nil { onUnauthorized?() }
            throw e
        }
        return (data, status)
    }

    public func send<T: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws -> T {
        let (data, _) = try await raw(method, path, query: query)
        return try Self.decode(T.self, data, path)
    }

    public func send<T: Decodable, B: Encodable>(_ method: String, _ path: String, query: [URLQueryItem] = [], body: B) async throws -> T {
        let (data, _) = try await raw(method, path, query: query, body: try Self.encoder.encode(body))
        return try Self.decode(T.self, data, path)
    }

    public func sendIgnoringBody(_ method: String, _ path: String, query: [URLQueryItem] = []) async throws {
        _ = try await raw(method, path, query: query)
    }

    public func sendIgnoringBody<B: Encodable>(_ method: String, _ path: String, query: [URLQueryItem] = [], body: B) async throws {
        _ = try await raw(method, path, query: query, body: try Self.encoder.encode(body))
    }

    /// A body the generated model can't read is a contract break, not bad data: say which route.
    static func decode<T: Decodable>(_ t: T.Type, _ data: Data, _ path: String) throws -> T {
        do { return try decoder.decode(T.self, from: data) } catch {
            throw APIError(status: 0, code: "decode_failed", message: "This version of the app couldn't read AthleteOS's answer for \(path). Update the app; if it's current, the server is newer than the app expects. (\(error))")
        }
    }
}

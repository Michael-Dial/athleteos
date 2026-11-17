import Foundation
import Testing
@testable import AthleteKit

enum Samples {
    nonisolated(unsafe) static let all: [String: [String: Any]] = {
        let url = Bundle.module.url(forResource: "Samples", withExtension: "json")!
        return try! JSONSerialization.jsonObject(with: Data(contentsOf: url)) as! [String: [String: Any]]
    }()

    /// Decodes the type's fullest and emptiest sample; either failing is a model the server can break.
    static func decode<T: Decodable>(_ t: T.Type, _ name: String) throws {
        let entry = try #require(all[name], "no sample for \(name)")
        for mode in ["max", "min"] {
            let data = try JSONSerialization.data(withJSONObject: entry[mode]!)
            do { _ = try JSONDecoder().decode(T.self, from: data) } catch {
                Issue.record("\(name) (\(mode)) did not decode: \(error)")
            }
        }
    }
}

func fixture(_ name: String) throws -> Data {
    let url = try #require(Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures"))
    return try Data(contentsOf: url)
}

final class MemoryStorage: SecureStorage, @unchecked Sendable {
    var values: [String: Data] = [:]
    func read(_ key: String) throws -> Data? { values[key] }
    func write(_ key: String, _ data: Data) throws { values[key] = data }
    func delete(_ key: String) throws { values[key] = nil }
}

/// Answers every request from a table, and records what was asked.
final class StubProtocol: URLProtocol, @unchecked Sendable {
    nonisolated(unsafe) static var handler: ((URLRequest) -> (Int, Data))?
    nonisolated(unsafe) static var seen: [URLRequest] = []

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func startLoading() {
        var req = request
        if req.httpBody == nil, let stream = req.httpBodyStream {
            stream.open(); defer { stream.close() }
            var data = Data(); var buf = [UInt8](repeating: 0, count: 4096)
            while stream.hasBytesAvailable { let n = stream.read(&buf, maxLength: buf.count); if n <= 0 { break }; data.append(buf, count: n) }
            req.httpBody = data
        }
        Self.seen.append(req)
        let (status, body) = Self.handler?(req) ?? (500, Data())
        client?.urlProtocol(self, didReceive: HTTPURLResponse(url: req.url!, statusCode: status, httpVersion: nil, headerFields: nil)!, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: body)
        client?.urlProtocolDidFinishLoading(self)
    }
    override func stopLoading() {}

    static func session() -> URLSession {
        let c = URLSessionConfiguration.ephemeral
        c.protocolClasses = [StubProtocol.self]
        return URLSession(configuration: c)
    }
}

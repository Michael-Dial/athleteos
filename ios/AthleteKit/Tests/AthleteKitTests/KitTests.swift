import Foundation
import Testing
@testable import AthleteKit

@Suite struct InviteCodeTests {
    @Test func normalizesWhatPeopleType() {
        #expect(InviteCode.normalize(" 7kq2m x9d4r ") == "7KQ2M-X9D4R")
        #expect(InviteCode.normalize("7KQ2MX9D4R") == "7KQ2M-X9D4R")
        #expect(InviteCode.normalize("O0IL1-ABCDE") == "00111-ABCDE")
    }

    @Test func refusesNonCodes() {
        #expect(InviteCode.normalize("") == nil)
        #expect(InviteCode.normalize("7KQ2M-X9D4") == nil)
        #expect(InviteCode.normalize("7KQ2M-X9D4U") == nil)
    }

    @Test func readsInviteLinks() throws {
        let a = try #require(InviteCode.fromLink(URL(string: "athleteos://invite/7kq2m-x9d4r")!))
        #expect(a.code == "7KQ2M-X9D4R")
        #expect(a.server == nil)
        let b = try #require(InviteCode.fromLink(URL(string: "athleteos://invite/7KQ2M-X9D4R?server=https://example.org/")!))
        #expect(b.server?.absoluteString == "https://example.org")
        #expect(InviteCode.fromLink(URL(string: "https://invite/7KQ2M-X9D4R")!) == nil)
    }
}

@Suite struct ServerAddressTests {
    @Test func acceptsHttpsAndLocalHttp() {
        #expect(ServerAddress.parse("athleteos.example.org")?.absoluteString == "https://athleteos.example.org")
        #expect(ServerAddress.parse("https://athleteos.example.org/")?.absoluteString == "https://athleteos.example.org")
        #expect(ServerAddress.parse("http://192.168.8.222:3020")?.absoluteString == "http://192.168.8.222:3020")
    }

    @Test func refusesPlainHttpOnTheInternet() {
        #expect(ServerAddress.parse("http://athleteos.example.org") == nil)
        #expect(ServerAddress.parse("") == nil)
    }
}

@Suite struct JSONScalarTests {
    @Test func keepsNumbersBoolsAndText() throws {
        let d = try JSONDecoder().decode([String: JSONScalar].self, from: Data(#"{"a":3,"b":true,"c":"x","d":0}"#.utf8))
        #expect(d["a"] == .number(3))
        #expect(d["b"] == .bool(true))
        #expect(d["c"] == .string("x"))
        // Zero is a number, never "false".
        #expect(d["d"] == .number(0))
    }
}

@Suite(.serialized) struct APIClientTests {
    @Test func sendsTokenPathAndQuery() async throws {
        StubProtocol.seen = []
        StubProtocol.handler = { _ in (200, try! fixture("today")) }
        let client = APIClient(baseURL: URL(string: "https://a.example")!, token: "aos_x", session: StubProtocol.session())
        _ = try await client.getToday(query: [URLQueryItem(name: "date", value: "2026-11-17")])
        let r = try #require(StubProtocol.seen.last)
        #expect(r.url?.absoluteString == "https://a.example/api/v1/today?date=2026-11-17")
        #expect(r.value(forHTTPHeaderField: "authorization") == "Bearer aos_x")
    }

    @Test func escapesPathSegments() async throws {
        StubProtocol.seen = []
        StubProtocol.handler = { _ in (200, try! fixture("questionnaires_morning-wellness")) }
        let client = APIClient(baseURL: URL(string: "https://a.example")!, token: "t", session: StubProtocol.session())
        _ = try await client.getQuestionnairesBySlug(slug: "a/../b")
        #expect(StubProtocol.seen.last?.url?.path(percentEncoded: true) == "/api/v1/questionnaires/a%2F..%2Fb")
    }

    @Test func surfacesTheServersMessage() async throws {
        StubProtocol.handler = { _ in (401, Data(#"{"error":{"code":"bad_invite","message":"That invite code isn't valid."}}"#.utf8)) }
        let client = APIClient(baseURL: URL(string: "https://a.example")!, token: nil, session: StubProtocol.session())
        await #expect(throws: APIError(status: 401, code: "bad_invite", message: "That invite code isn't valid.")) {
            _ = try await client.postAuthInvite(body: AuthInvitePostBody(code: "x", name: "iPhone"))
        }
    }

    @Test func passwordSignInCanAskForACode() async throws {
        StubProtocol.handler = { _ in (202, Data(#"{"challengeId":"c1","delivery":"email","destination":"m***@x.org","expiresInSec":600}"#.utf8)) }
        let client = APIClient(baseURL: URL(string: "https://a.example")!, token: nil, session: StubProtocol.session())
        guard case .needsCode(let c) = try await client.postAuthToken(password: "p", deviceName: "iPhone") else {
            Issue.record("expected a challenge"); return
        }
        #expect(c.challengeId == "c1")
    }

    @Test func syncSessionPointsTheSDKAtTheProxy() async throws {
        StubProtocol.handler = { _ in (200, Data(#"{"owUserId":"u1","accessToken":"a","refreshToken":"r","expiresIn":3600,"syncPath":"/ow"}"#.utf8)) }
        let client = APIClient(baseURL: URL(string: "https://athleteos.example")!, token: "t", session: StubProtocol.session())
        let s = try await client.syncSession()
        #expect(s.host == "https://athleteos.example/ow")
        #expect(s.owUserId == "u1")
    }
}

@Suite struct FmtTests {
    @Test func localDayUsesThePhonesZoneNotUTC() {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "America/New_York")!
        // 2026-11-18 01:30 UTC is still the 17th in New York.
        let d = Date(timeIntervalSince1970: 1794965400)
        #expect(Fmt.localDay(d, calendar: cal) == "2026-11-17")
    }

    @Test func missingIsADashNotZero() {
        #expect(Fmt.number(nil) == Fmt.dash)
        #expect(Fmt.duration(minutes: nil) == Fmt.dash)
        #expect(Fmt.duration(minutes: 90) == "1 h 30 min")
        #expect(Fmt.addDays("2026-11-30", 1) == "2026-12-01")
    }
}

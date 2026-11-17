import Foundation
import Testing
@testable import AthleteKit

/// Answers captured from a running server decode into the generated models.
@Suite struct FixtureDecodeTests {
    func decode<T: Decodable>(_ t: T.Type, _ name: String) throws -> T {
        try JSONDecoder().decode(T.self, from: try fixture(name))
    }

    @Test func realAnswersDecode() throws {
        _ = try decode(MeResponse.self, "me")
        let today = try decode(TodayResponse.self, "today")
        #expect(!today.date.isEmpty)
        _ = try decode(ReadinessResponse.self, "readiness")
        _ = try decode(TrainingResponse.self, "training")
        _ = try decode(PlanResponse.self, "plan")
        _ = try decode(QuestionnairesResponse.self, "questionnaires")
        let q = try decode(QuestionnairesBySlugResponse.self, "questionnaires_morning-wellness")
        #expect(q.items.count == 7)
        _ = try decode(WellnessResponse.self, "wellness")
        _ = try decode(TrendsResponse.self, "trends")
        let accounts = try decode(AccountsResponse.self, "accounts")
        #expect(accounts.services.contains { $0.kind == .phone })
        _ = try decode(SettingsResponse.self, "settings")
        _ = try decode(NightlyResponse.self, "nightly")
        _ = try decode(CoverageResponse.self, "coverage")
        _ = try decode(ReviewResponse.self, "review")
    }

    @Test func unknownEnumValueDecodesAsUnrecognized() throws {
        var json = String(data: try fixture("today"), encoding: .utf8)!
        json = json.replacingOccurrences(of: "\"overall\":\"unknown\"", with: "\"overall\":\"purple\"")
        let today = try JSONDecoder().decode(TodayResponse.self, from: Data(json.utf8))
        #expect(today.readiness.overall == .unrecognized)
    }
}

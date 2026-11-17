import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { openApiDocument } from "./openapi";
import { generateSamples, generateSwift, pascal } from "./swift-gen";

const KIT = join(__dirname, "../../../ios/AthleteKit");
const OUT = join(KIT, "Sources/AthleteKit/Generated/API.swift");
const SAMPLES = join(KIT, "Tests/AthleteKitTests/Generated/Samples.json");
const DECODE_TESTS = join(KIT, "Tests/AthleteKitTests/Generated/GeneratedDecodeTests.swift");

describe("iOS models from the route table", () => {
  const swift = generateSwift(openApiDocument("") as unknown as Parameters<typeof generateSwift>[0]);

  it("names things the way the app expects", () => {
    expect(pascal("sdk-token")).toBe("SdkToken");
    expect(pascal("lastNight")).toBe("LastNight");
    expect(swift).toContain("public struct TodayResponse: Codable");
    expect(swift).toContain("func getToday(query: [URLQueryItem] = []) async throws -> TodayResponse");
    expect(swift).toContain("func postAuthInvite(body: AuthInvitePostBody) async throws -> AuthInvitePostResponse");
    expect(swift).toContain("func putQuestionnairesBySlugResponsesByDate(slug: String, date: String, body:");
  });

  it("decodes unknown enum values instead of failing", () => {
    expect(swift).toMatch(/case unrecognized = "\\u\{0\}unrecognized"/);
  });

  it("commits samples of every response for the app's decode tests", () => {
    const { json, swiftTest } = generateSamples(openApiDocument("") as unknown as Parameters<typeof generateSamples>[0]);
    expect(swiftTest).toContain("try Samples.decode(TodayResponse.self, \"TodayResponse\")");
    if (process.env.UPDATE_SWIFT) { writeFileSync(SAMPLES, json); writeFileSync(DECODE_TESTS, swiftTest); }
    expect(readFileSync(SAMPLES, "utf8"), "run UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen").toBe(json);
    expect(readFileSync(DECODE_TESTS, "utf8"), "run UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen").toBe(swiftTest);
  });

  it("is committed as generated", () => {
    if (process.env.UPDATE_SWIFT) writeFileSync(OUT, swift);
    expect(existsSync(OUT), "run UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen").toBe(true);
    expect(readFileSync(OUT, "utf8"), "the API changed: run UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen and commit ios/").toBe(swift);
  });
});

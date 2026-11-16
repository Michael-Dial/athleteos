import { describe, expect, it } from "vitest";
import { checkPassword, createSessionToken, verifySessionToken } from "./auth";

process.env.SESSION_SECRET = "x".repeat(40);
process.env.ATHLETEOS_PASSWORD = "correct horse";

describe("session tokens", () => {
  it("round-trips and rejects tampering/expiry", async () => {
    const { token } = await createSessionToken(1_000);
    expect(await verifySessionToken(token, 2_000)).toBe(true);
    expect(await verifySessionToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 2_000)).toBe(false);
    expect(await verifySessionToken(token, 1_000 + 31 * 86400_000)).toBe(false);
    const [, , sig] = token.split(".");
    expect(await verifySessionToken(`v1.${9e15}.${sig}`, 2_000)).toBe(false);
  });
  it("checks the password", async () => {
    expect(await checkPassword("correct horse")).toBe(true);
    expect(await checkPassword("wrong")).toBe(false);
  });
});

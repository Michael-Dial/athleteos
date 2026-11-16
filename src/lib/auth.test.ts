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

import { createTrustToken, maskEmail, verifyTrustToken, codeHash } from "./auth";

describe("trusted-device tokens", () => {
  it("verify, expire, and die when the epoch moves", async () => {
    const { token } = await createTrustToken(3, 1_000);
    expect(await verifyTrustToken(token, 3, 2_000)).toBe(true);
    expect(await verifyTrustToken(token, 4, 2_000)).toBe(false); // "forget all devices"
    expect(await verifyTrustToken(token, 3, 1_000 + 31 * 86400_000)).toBe(false);
    const parts = token.split(".");
    parts[2] = "4";
    expect(await verifyTrustToken(parts.join("."), 4, 2_000)).toBe(false); // can't forge a new epoch
  });
  it("code hashes are bound to their challenge", async () => {
    expect(await codeHash("a", "123456")).not.toBe(await codeHash("b", "123456"));
    expect(await codeHash("a", "123456")).toBe(await codeHash("a", "123456"));
  });
  it("masks the email address", () => {
    expect(maskEmail("someone@example.com")).toBe("s•••@e•••.com");
  });
});

import { describe, expect, it } from "vitest";
import { createSessionToken, hmac, verifySessionToken } from "./auth";
import { checkPassword } from "./signin";

process.env.SESSION_SECRET = "x".repeat(40);
process.env.ATHLETEOS_PASSWORD = "correct horse";
delete process.env.DATABASE_URL;

describe("session tokens", () => {
  it("round-trips and rejects tampering/expiry", async () => {
    const { token } = await createSessionToken(0, 1_000);
    expect(await verifySessionToken(token, 0, 2_000)).toBe(true);
    expect(await verifySessionToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 0, 2_000)).toBe(false);
    expect(await verifySessionToken(token, 0, 1_000 + 31 * 86400_000)).toBe(false);
    const [, , , sig] = token.split(".");
    expect(await verifySessionToken(`v2.${9e15}.0.${sig}`, 0, 2_000)).toBe(false);
  });
  it("ends sessions from an older epoch and can't be re-stamped", async () => {
    const { token } = await createSessionToken(2, 1_000);
    expect(await verifySessionToken(token, 2, 2_000)).toBe(true);
    expect(await verifySessionToken(token, 3, 2_000)).toBe(false); // password changed / signed out elsewhere
    const p = token.split(".");
    p[2] = "3";
    expect(await verifySessionToken(p.join("."), 3, 2_000)).toBe(false);
  });
  it("honours pre-epoch v1 cookies only until the first bump", async () => {
    const payload = `v1.${1_000 + 86400_000}`;
    const v1 = `${payload}.${await hmac(payload)}`;
    expect(await verifySessionToken(v1, 0, 2_000)).toBe(true);
    expect(await verifySessionToken(v1, 1, 2_000)).toBe(false);
  });
  it("checks the environment password when none is set in the app", async () => {
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

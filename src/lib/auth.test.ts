import { describe, expect, it } from "vitest";
import { createSessionToken, hmac, readSessionToken } from "./auth";

process.env.SESSION_SECRET = "x".repeat(40);
delete process.env.DATABASE_URL;

describe("session tokens", () => {
  it("round-trip the user and epoch, and reject tampering and expiry", async () => {
    const { token } = await createSessionToken(7, 2, 1_000);
    expect(await readSessionToken(token, 2_000)).toEqual({ userId: 7, epoch: 2 });
    expect(await readSessionToken(token.replace(/.$/, (c) => (c === "A" ? "B" : "A")), 2_000)).toBeNull();
    expect(await readSessionToken(token, 1_000 + 31 * 86400_000)).toBeNull();
  });
  it("can't be re-pointed at another user or epoch", async () => {
    const { token } = await createSessionToken(7, 2, 1_000);
    const p = token.split(".");
    expect(await readSessionToken([p[0], p[1], "1", p[3], p[4]].join("."), 2_000)).toBeNull(); // another user (an admin)
    expect(await readSessionToken([p[0], p[1], p[2], "3", p[4]].join("."), 2_000)).toBeNull(); // forge a fresh epoch
  });
  it("rejects cookies from before per-user sign-in", async () => {
    for (const payload of [`v1.${1_000 + 86400_000}`, `v2.${1_000 + 86400_000}.0`]) {
      expect(await readSessionToken(`${payload}.${await hmac(payload)}`, 2_000)).toBeNull();
    }
  });
});

import { createTrustToken, maskEmail, verifyTrustToken, codeHash } from "./auth";

describe("trusted-device tokens", () => {
  it("verify, expire, and die when the user's epoch moves", async () => {
    const { token } = await createTrustToken(5, 3, 1_000);
    expect(await verifyTrustToken(token, 5, 3, 2_000)).toBe(true);
    expect(await verifyTrustToken(token, 5, 4, 2_000)).toBe(false); // "forget trusted devices"
    expect(await verifyTrustToken(token, 6, 3, 2_000)).toBe(false); // trusted by another user on this browser
    expect(await verifyTrustToken(token, 5, 3, 1_000 + 31 * 86400_000)).toBe(false);
    const parts = token.split(".");
    parts[3] = "4";
    expect(await verifyTrustToken(parts.join("."), 5, 4, 2_000)).toBe(false); // can't forge a new epoch
  });
  it("code hashes are bound to their challenge", async () => {
    expect(await codeHash("a", "123456")).not.toBe(await codeHash("b", "123456"));
    expect(await codeHash("a", "123456")).toBe(await codeHash("a", "123456"));
  });
  it("masks the email address", () => {
    expect(maskEmail("someone@example.com")).toBe("s•••@e•••.com");
  });
});

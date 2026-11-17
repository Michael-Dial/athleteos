import { describe, expect, it } from "vitest";
import { hashPassword, seal, unseal, verifyPassword } from "./vault";

process.env.SESSION_SECRET = "v".repeat(40);

describe("credential sealing", () => {
  it("round-trips and never stores the plain text", () => {
    const s = seal("OW_API_KEY", "sk-live-123");
    expect(s).not.toContain("sk-live-123");
    expect(unseal("OW_API_KEY", s)).toBe("sk-live-123");
    expect(seal("OW_API_KEY", "same")).not.toBe(seal("OW_API_KEY", "same")); // fresh IV each time
  });
  it("refuses a value moved to another name, tampered with, or sealed under another secret", () => {
    const s = seal("SMTP_PASS", "hunter2");
    expect(unseal("LOGIN_EMAIL", s)).toBeNull();
    const p = s.split(".");
    p[2] = p[2].slice(0, -2) + (p[2].endsWith("AA") ? "BB" : "AA");
    expect(unseal("SMTP_PASS", p.join("."))).toBeNull();
    process.env.SESSION_SECRET = "w".repeat(40);
    expect(unseal("SMTP_PASS", s)).toBeNull();
    process.env.SESSION_SECRET = "v".repeat(40);
    expect(unseal("SMTP_PASS", s)).toBe("hunter2");
  });
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h.startsWith("scrypt.")).toBe(true);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { CODE_LENGTH, hashInviteCode, newInviteCode, normalizeInviteCode } from "./invite-code";

describe("invite codes", () => {
  it("are 10 Crockford characters in two groups, and normalize to themselves", () => {
    for (let i = 0; i < 200; i++) {
      const c = newInviteCode();
      expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/);
      expect(normalizeInviteCode(c)).toBe(c);
    }
  });

  it("forgive case, spaces, missing dash and the usual misreadings", () => {
    expect(normalizeInviteCode(" 7kq2m x9d4r ")).toBe("7KQ2M-X9D4R");
    expect(normalizeInviteCode("7KQ2MX9D4R")).toBe("7KQ2M-X9D4R");
    expect(normalizeInviteCode("O0IL1-ABCDE")).toBe("00111-ABCDE");
  });

  it("refuse anything that cannot be a code", () => {
    expect(normalizeInviteCode("")).toBeNull();
    expect(normalizeInviteCode("7KQ2M-X9D4")).toBeNull();
    expect(normalizeInviteCode("7KQ2M-X9D4RR")).toBeNull();
    expect(normalizeInviteCode("7KQ2M-X9D4U")).toBeNull(); // U is not in the alphabet
    expect("7KQ2MX9D4R".length).toBe(CODE_LENGTH);
  });

  it("hash the canonical form, so differently typed copies match", () => {
    expect(hashInviteCode(normalizeInviteCode("7kq2m x9d4r")!)).toBe(hashInviteCode("7KQ2M-X9D4R"));
    expect(hashInviteCode("7KQ2M-X9D4R")).not.toContain("7KQ2M");
  });
});

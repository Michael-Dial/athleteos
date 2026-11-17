import { describe, expect, it } from "vitest";
import { testSendsSavedSecretElsewhere, type CredName } from "./credentials";

const set = (...n: CredName[]) => new Set<CredName>(n);

describe("testSendsSavedSecretElsewhere", () => {
  it("is false when the address is unchanged, whatever else changed", () => {
    expect(testSendsSavedSecretElsewhere(set(), set("OW_API_KEY"))).toBe(false);
    expect(testSendsSavedSecretElsewhere(set("OW_EMAIL"), set("OW_PASSWORD"))).toBe(false);
    expect(testSendsSavedSecretElsewhere(set("SMTP_USER", "SMTP_FROM"), set("SMTP_PASS"))).toBe(false);
  });

  it("is true when a new address would receive a saved secret", () => {
    expect(testSendsSavedSecretElsewhere(set("OW_API_BASE"), set("OW_API_KEY"))).toBe(true);
    expect(testSendsSavedSecretElsewhere(set("SMTP_HOST"), set("SMTP_PASS"))).toBe(true);
    expect(testSendsSavedSecretElsewhere(set("SMTP_PORT"), set("SMTP_PASS"))).toBe(true);
    // One secret retyped, the other still the saved one.
    expect(testSendsSavedSecretElsewhere(set("OW_API_BASE", "OW_API_KEY"), set("OW_API_KEY", "OW_PASSWORD"))).toBe(true);
  });

  it("is false when every secret going to the new address was typed into the form", () => {
    expect(testSendsSavedSecretElsewhere(set("OW_API_BASE", "OW_API_KEY"), set("OW_API_KEY"))).toBe(false);
    expect(testSendsSavedSecretElsewhere(set("SMTP_HOST", "SMTP_PASS"), set("SMTP_PASS"))).toBe(false);
    expect(testSendsSavedSecretElsewhere(set("OW_API_BASE"), set())).toBe(false);
  });
});

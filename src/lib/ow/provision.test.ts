import { describe, expect, it } from "vitest";
import { splitName } from "./provision";
import { PHONE_CODE_RE } from "../domain/phone-code";
import { SettingsSchema } from "../settings";
import { seal, unseal } from "../vault";

process.env.SESSION_SECRET = "v".repeat(40);

describe("backend user provisioning", () => {
  it("splits the athlete's name at the first space", () => {
    expect(splitName("Ada")).toEqual({ first: "Ada", last: "" });
    expect(splitName("  Ada   King Lovelace ")).toEqual({ first: "Ada", last: "King Lovelace" });
    expect(splitName("")).toEqual({ first: "", last: "" });
  });
});

describe("phone pairing code", () => {
  it("accepts a pasted code and refuses blanks and spaces", () => {
    expect(PHONE_CODE_RE.test("AB12-CD34")).toBe(true);
    expect(PHONE_CODE_RE.test("abc")).toBe(false);
    expect(PHONE_CODE_RE.test("AB12 CD34")).toBe(false);
  });

  it("is bound to its athlete: one athlete's sealed code does not open as another's", () => {
    const s = seal("athlete:1:phone_code", "AB12-CD34");
    expect(unseal("athlete:1:phone_code", s)).toBe("AB12-CD34");
    expect(unseal("athlete:2:phone_code", s)).toBeNull();
  });
});

describe("phone app settings", () => {
  it("defaults to no name and no link", () => {
    expect(SettingsSchema.parse({}).phoneApp).toEqual({ name: "", installUrl: "" });
  });

  it("takes only an https install link", () => {
    expect(SettingsSchema.safeParse({ phoneApp: { installUrl: "https://testflight.apple.com/join/abc" } }).success).toBe(true);
    expect(SettingsSchema.safeParse({ phoneApp: { installUrl: "http://example.com/app" } }).success).toBe(false);
    expect(SettingsSchema.safeParse({ phoneApp: { installUrl: "javascript:alert(1)" } }).success).toBe(false);
  });
});

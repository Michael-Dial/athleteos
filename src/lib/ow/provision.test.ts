import { describe, expect, it } from "vitest";
import { splitName } from "./provision";
import { SettingsSchema } from "../settings";

describe("backend user provisioning", () => {
  it("splits the athlete's name at the first space", () => {
    expect(splitName("Ada")).toEqual({ first: "Ada", last: "" });
    expect(splitName("  Ada   King Lovelace ")).toEqual({ first: "Ada", last: "King Lovelace" });
    expect(splitName("")).toEqual({ first: "", last: "" });
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

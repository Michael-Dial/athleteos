import { describe, expect, it } from "vitest";
import { phoneProvidersFor, platformOf } from "./platform";

const P = [{ provider: "samsung", name: "Samsung Health" }, { provider: "apple", name: "Apple Health" }, { provider: "google", name: "Health Connect" }];

describe("phone health providers by platform", () => {
  it("detects the platform from the user agent", () => {
    expect(platformOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)")).toBe("ios");
    expect(platformOf("Mozilla/5.0 (Linux; Android 15; Pixel 9)")).toBe("android");
    expect(platformOf("Mozilla/5.0 (Macintosh)")).toBeNull();
  });
  it("shows only what the phone can use, its own store first", () => {
    expect(phoneProvidersFor([...P], "ios").map((p) => p.provider)).toEqual(["apple"]);
    expect(phoneProvidersFor([...P], "android").map((p) => p.provider)[0]).toMatch(/samsung|google/);
    expect(phoneProvidersFor([...P], "android").some((p) => p.provider === "apple")).toBe(false);
    expect(phoneProvidersFor([...P], null)).toHaveLength(3);
  });
});

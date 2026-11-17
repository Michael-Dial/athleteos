import { describe, expect, it } from "vitest";
import { forwardRequestHeaders, sdkPathAllowed } from "./sdk-proxy";

const U = "c3664694-c6d0-4432-b38e-5146e239ef13";

describe("phone sync proxy", () => {
  it("passes exactly the SDK's calls", () => {
    expect(sdkPathAllowed("POST", `sdk/users/${U}/sync`)).toBe(true);
    expect(sdkPathAllowed("POST", `sdk/users/${U}/logs`)).toBe(true);
    expect(sdkPathAllowed("GET", `sdk/users/${U}/beat-capture`)).toBe(true);
    expect(sdkPathAllowed("POST", `sdk/users/${U}/beat-capture/windows/w1/fulfilled`)).toBe(true);
    expect(sdkPathAllowed("POST", "token/refresh")).toBe(true);
    expect(sdkPathAllowed("DELETE", `users/${U}/connections/apple`)).toBe(true);
  });

  it("refuses the rest of OW's API, other methods and traversal", () => {
    for (const [m, p] of [
      ["GET", "users"], ["GET", `users/${U}`], ["GET", `users/${U}/connections`], ["POST", "users"],
      ["GET", "applications"], ["GET", "oauth/providers"], ["DELETE", `users/${U}/connections/garmin`],
      ["GET", `sdk/users/${U}/sync`], ["POST", `sdk/users/not-a-uuid/sync`], ["POST", `sdk/users/${U}/sync/../../users`],
      ["POST", `sdk/users/${U}//sync`], ["GET", `users/${U}/timeseries`],
    ]) expect(sdkPathAllowed(m, p), `${m} ${p}`).toBe(false);
  });

  it("never forwards cookies or an API key", () => {
    const h = new Headers({ authorization: "Bearer x", cookie: "aos_session=1", "x-open-wearables-api-key": "k", "content-type": "application/json", "x-open-wearables-sdk-version": "0.17.0" });
    const out = forwardRequestHeaders(h);
    expect(out.get("authorization")).toBe("Bearer x");
    expect(out.get("cookie")).toBeNull();
    expect(out.get("x-open-wearables-api-key")).toBeNull();
    expect(out.get("x-open-wearables-sdk-version")).toBe("0.17.0");
  });
});

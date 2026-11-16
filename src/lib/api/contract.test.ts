import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ROUTES } from "./openapi";

// Live contract test against a running server with an empty database and no
// Open Wearables (as in CI). Skipped unless API_BASE and API_PASSWORD are set:
//   API_BASE=http://127.0.0.1:3020 API_PASSWORD=... npx vitest run lib/api/contract.test.ts
const BASE = process.env.API_BASE;
const PASSWORD = process.env.API_PASSWORD;
const live = BASE && PASSWORD ? describe : describe.skip;

const spec = (method: string, path: string) => {
  const r = ROUTES.find((x) => x.method === method && x.path === path);
  if (!r?.response) throw new Error(`no response schema for ${method} ${path}`);
  return r.response;
};

live("API v1 contract (live)", () => {
  let token = "";
  const call = async (method: string, path: string, body?: unknown, auth = true) => {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { ...(auth ? { authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, data: text ? JSON.parse(text) : null };
  };
  // Parse with the documented schema, strictly, so undocumented drift fails.
  const ok = async (method: string, path: string, docPath: string, body?: unknown) => {
    const r = await call(method.toUpperCase(), path, body);
    expect(r.status, JSON.stringify(r.data)).toBeLessThan(300);
    // Tests read deep fields; the schema parse above is the real type check.
    return spec(method, docPath).parse(r.data) as any; // eslint-disable-line @typescript-eslint/no-explicit-any
  };

  it("issues tokens only for the right password", async () => {
    const bad = await call("POST", "/auth/token", { password: "nope", name: "test" }, false);
    expect(bad.status).toBe(401);
    expect(bad.data.error.code).toBe("bad_credentials");
    const good = await call("POST", "/auth/token", { password: PASSWORD, name: "contract-test" }, false);
    expect(good.status).toBe(201);
    // CI runs without emailed codes, so the password alone returns a token.
    token = (spec("post", "/auth/token").parse(good.data) as { token: string }).token;
    expect(token).toMatch(/^aos_/);
  });

  it("rejects unauthenticated and bad-token requests", async () => {
    expect((await call("GET", "/me", undefined, false)).status).toBe(401);
    const saved = token;
    token = "aos_not-a-real-token";
    expect((await call("GET", "/me")).status).toBe(401);
    token = saved;
  });

  let today = "";
  it("me / today / readiness / nightly match their schemas", async () => {
    const me = await ok("get", "/me", "/me");
    today = me.today;
    expect(me.auth).toBe("token");
    const t = await ok("get", "/today", "/today");
    expect(Object.keys(t.lastNight).sort()).toEqual(["hrv", "respiratory_rate", "rhr", "sleep", "spo2"]);
    const r = await ok("get", "/readiness?days=14", "/readiness");
    expect(r.load.series.length).toBe(14);
    await ok("get", "/nightly", "/nightly");
  });

  it("validates questionnaire answers and feeds wellness", async () => {
    const list = await ok("get", "/questionnaires", "/questionnaires");
    expect(list.questionnaires.some((q: { slug: string }) => q.slug === "morning-wellness")).toBe(true);
    const bad = await call("PUT", `/questionnaires/morning-wellness/responses/${today}`, { answers: { fatigue: 9 } });
    expect(bad.status).toBe(422);
    expect(bad.data.error.details.map((d: { path: string }) => d.path)).toContain("answers.fatigue");
    const answers = { fatigue: 3, sleep_quality: 3, soreness: 3, stress: 3, mood: 3, illness: false, notes: "contract" };
    const saved = await ok("put", `/questionnaires/morning-wellness/responses/${today}`, "/questionnaires/{slug}/responses/{date}", { answers });
    expect(saved.answers.fatigue).toBe(3);
    const w = await ok("get", "/wellness", "/wellness");
    expect(w.days.find((d: { date: string }) => d.date === today)?.composite).toBe(50);
    const future = await call("PUT", "/questionnaires/morning-wellness/responses/2999-01-01", { answers });
    expect(future.status).toBe(400);
  });

  it("plan vs actual: a planned session is matched by a manual log of the same sport", async () => {
    const phase = await ok("post", "/plan/phases", "/plan/phases", { name: "Contract build", kind: "build", startDate: today, endDate: today });
    const ps = await ok("post", "/plan/sessions", "/plan/sessions", { date: today, sport: "row", title: "Contract erg", plannedDurationMin: 40, plannedRpe: 5 });
    const m = await ok("post", "/training/manual", "/training/manual", { date: today, sport: "row", title: "Erg", durationMin: 45, rpe: 6 });
    const plan = await ok("get", `/plan?start=${today}&end=${today}`, "/plan");
    const mine = plan.sessions.find((s: { id: number }) => s.id === ps.id);
    expect(mine.status).toBe("done");
    expect(mine.actualKey).toBe(m.key);
    expect(mine.phaseId).toBe(phase.id);
    expect(mine.plannedLoad).toBe(200);
    const tr = await ok("get", `/training?start=${today}&end=${today}`, "/training");
    expect(tr.sessions.find((s: { key: string }) => s.key === m.key)?.load).toBe(270);
    // Cleanup, and 404 on a second delete.
    expect((await call("DELETE", `/training/manual/${m.id}`)).status).toBe(204);
    expect((await call("DELETE", `/training/manual/${m.id}`)).status).toBe(404);
    expect((await call("DELETE", `/plan/sessions/${ps.id}`)).status).toBe(204);
    expect((await call("DELETE", `/plan/phases/${phase.id}`)).status).toBe(204);
  });

  it("rejects invalid writes with field-level details", async () => {
    const r = await call("POST", "/training/manual", { date: "yesterday", sport: "row", durationMin: 0 });
    expect(r.status).toBe(422);
    const paths = r.data.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(["date", "durationMin"]));
    expect((await call("POST", "/plan/sessions", "not json at all")).status).toBe(422);
  });

  it("settings patch validates the merged result and saves nothing on error", async () => {
    const before = await ok("get", "/settings", "/settings");
    const bad = await call("PATCH", "/settings", { hrv: { swcSd: 99 }, timezone: "Europe/London" });
    expect(bad.status).toBe(422);
    expect((await ok("get", "/settings", "/settings")).timezone).toBe(before.timezone);
    const good = await ok("patch", "/settings", "/settings", { hrv: { swcSd: 0.6 } });
    expect(good.hrv.swcSd).toBe(0.6);
    expect(good.hrv.rollingDays).toBe(before.hrv.rollingDays);
    await ok("patch", "/settings", "/settings", { hrv: { swcSd: before.hrv.swcSd } });
  });

  it("dashboard endpoints match their schemas", async () => {
    const review = await ok("get", "/review", "/review");
    expect(review.hrv.weeks).toHaveLength(4);
    await ok("get", `/review?week=2026-01-07`, "/review");
    expect((await call("GET", "/review?week=2999-01-05")).status).toBe(400);
    const cov = await ok("get", "/coverage?days=30", "/coverage");
    expect(cov.dates).toHaveLength(30);
    expect(cov.questionnaires.length).toBeGreaterThan(0);
    await ok("get", "/intensity", "/intensity");
    expect((await call("GET", "/intensity?start=2025-01-01&end=2026-01-01")).status).toBe(400);
    const tr = await ok("get", "/trends?weeks=8", "/trends");
    expect(tr.weeks).toHaveLength(8);
    const hrz = await ok("get", "/zones?metric=hr", "/zones");
    expect(hrz.zoneSet.bands).toHaveLength(5); // %HRmax preset needs no threshold
    const bike = await ok("get", "/zones?metric=bikepower", "/zones");
    expect(bike.needs.settingsKey).toBe("zones.bikepower.ftpW");
    expect(bike.zoneSet).toBeNull();
    await ok("patch", "/settings", "/settings", { zones: { bikepower: { ftpW: 280 } } });
    const bike2 = await ok("get", "/zones?metric=bikepower", "/zones");
    expect(bike2.zoneSet.bands).toHaveLength(7);
    expect((await call("GET", "/zones?metric=swim")).status).toBe(422);
    const ill = await ok("get", "/illness?days=7", "/illness");
    expect(ill.nights).toHaveLength(7);
  });

  it("publishes the OpenAPI document without auth", async () => {
    const res = await fetch(`${BASE}/api/v1/openapi.json`);
    expect(res.status).toBe(200);
    const doc = z.object({ openapi: z.string(), paths: z.record(z.string(), z.unknown()) }).parse(await res.json());
    expect(Object.keys(doc.paths)).toContain("/today");
  });

  it("revoked tokens stop working", async () => {
    const list = await ok("get", "/auth/tokens", "/auth/tokens");
    const mine = list.tokens.find((t: { name: string }) => t.name === "contract-test");
    expect((await call("DELETE", `/auth/tokens/${mine.id}`)).status).toBe(204);
    expect((await call("GET", "/me")).status).toBe(401);
  });
});

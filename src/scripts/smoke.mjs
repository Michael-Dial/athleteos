// Black-box smoke test against a running server: health, auth gate, login,
// and every page rendering without hitting the error boundary. Runs with no
// Open Wearables configured, so it also proves pages degrade gracefully.
// On a fresh database the first sign-in (install password + any email) creates
// the admin, so SMOKE_EMAIL becomes that admin's address.
// Usage: SMOKE_BASE=http://127.0.0.1:3020 SMOKE_PASSWORD=... [SMOKE_EMAIL=...] node scripts/smoke.mjs

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3020";
const PASSWORD = process.env.SMOKE_PASSWORD;
const EMAIL = process.env.SMOKE_EMAIL ?? "admin@example.test";
if (!PASSWORD) throw new Error("SMOKE_PASSWORD is required");

const PAGES = [
  "/", "/more", "/review", "/trends", "/history", "/history/intensity", "/history/zones", "/history/zones?metric=pace", "/history/zones?metric=bikepower", "/readiness/illness", "/wearables/coverage", "/plan", "/plan/phases", "/wellness", "/wellness/morning-wellness",
  "/questionnaires/morning-wellness", "/questionnaires/new", "/readiness",
  "/wearables", "/wearables/sleep", "/wearables/explore", "/wearables/compare", "/wearables/devices",
  "/settings", "/settings/devices", "/settings/accounts", "/settings/backend", "/settings/api", "/settings/notifications", "/settings/zones", "/settings/security", "/settings/credentials", "/settings/users", "/settings/users/1",
];

let failed = 0;
const check = (ok, name, detail = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail ? ` — ${detail}` : ""}`);
  if (!ok) failed++;
};
const get = (path, init = {}) => fetch(BASE + path, { redirect: "manual", ...init });

// Wait for the server (container or `node server.js`) to come up.
for (let i = 0; ; i++) {
  try { if ((await get("/api/health")).ok) break; } catch { /* not listening yet */ }
  if (i > 60) throw new Error(`server at ${BASE} never became healthy`);
  await new Promise((r) => setTimeout(r, 1000));
}

const health = await (await get("/api/health")).json();
check(health.status === "ok", "GET /api/health returns {status:\"ok\"}", JSON.stringify(health));

const gated = await get("/plan");
check(gated.status === 307 && new URL(gated.headers.get("location") ?? "", BASE).pathname === "/login", "unauthenticated page redirects to /login", String(gated.status));
const gatedApi = await get("/api/questionnaires/morning-wellness");
check(gatedApi.status === 401, "unauthenticated API returns 401", String(gatedApi.status));

const login = (pw) => get("/api/auth/login", { method: "POST", body: new URLSearchParams({ email: EMAIL, password: pw, next: "/" }) });
const bad = await login("definitely-wrong");
check((bad.headers.get("location") ?? "").includes("error="), "wrong password is rejected");
const good = await login(PASSWORD);
const cookie = (good.headers.get("set-cookie") ?? "").split(";")[0];
check(cookie.startsWith("aos_session="), "correct password sets a session cookie");

const open = await get("/login?next=//evil.example", {});
check(open.status === 200, "login page renders");
for (const evil of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
  const r = await get("/api/auth/login", { method: "POST", body: new URLSearchParams({ email: EMAIL, password: PASSWORD, next: evil }) });
  check(r.headers.get("location") === "/", `login refuses off-site redirect ${evil}`, r.headers.get("location") ?? "");
}
// Behind the tunnel the app sees an internal bind address; redirects must stay
// relative so the browser resolves them against the public host.
const tunneled = { "x-forwarded-proto": "https", "x-forwarded-host": "athleteos.example" };
const lg = await get("/api/auth/login", { method: "POST", headers: tunneled, body: new URLSearchParams({ email: EMAIL, password: PASSWORD, next: "/history" }) });
check(lg.headers.get("location") === "/history", "login redirect is relative", lg.headers.get("location") ?? "");
const gt = await get("/plan", { headers: tunneled });
check(gt.headers.get("location") === "https://athleteos.example/login?next=%2Fplan", "auth-gate redirect targets the public host", gt.headers.get("location") ?? "");
const lo = await get("/api/auth/logout", { method: "POST", headers: tunneled });
check(lo.status === 303 && lo.headers.get("location") === "/login", "logout works without a session and redirects relatively", `${lo.status} ${lo.headers.get("location")}`);

for (const p of PAGES) {
  const res = await get(p, { headers: { cookie } });
  const html = await res.text();
  const broken = html.includes("This page couldn") || html.includes("Application error");
  check(res.status === 200 && !broken, `GET ${p}`, `status ${res.status}${broken ? ", error boundary rendered" : ""}`);
}

// The old combined page forwards to the athlete page with its query, so an
// OAuth flow started before the split still lands on its confirmation.
const old = await get("/settings/connections?connected=garmin", { headers: { cookie } });
check([307, 308].includes(old.status) && (old.headers.get("location") ?? "").endsWith("/settings/accounts?connected=garmin"), "old connections URL forwards to accounts", `${old.status} ${old.headers.get("location")}`);

// Seed ran: the default wellness form exists and exports as JSON.
const def = await get("/api/questionnaires/morning-wellness", { headers: { cookie } });
const body = def.ok ? await def.json() : null;
check(body?.slug === "morning-wellness" && body.items?.length === 7, "seeded questionnaire exports as JSON");

console.log(failed ? `\n${failed} check(s) failed` : "\nall smoke checks passed");
process.exit(failed ? 1 : 0);

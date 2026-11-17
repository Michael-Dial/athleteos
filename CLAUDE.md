# CLAUDE.md — build brief for AthleteOS

AthleteOS is an AMS-style (athlete management system) health/fitness dashboard
with per-person accounts (admin or member), one athlete per user. **Open Wearables is the device
data backend — never call vendor APIs directly.**

## Environment (homelab, already provisioned)

- Host: Docker CT at `192.168.8.222` (Proxmox LXC). Compose lives in
  `/opt/data/docker/athleteos/` on that host; this repo mirrors it.
- **App port: 3020** (reserved — do not reuse; 3000/3011/3012/5555/6565/6569/
  7878/7879/8000/8082/8083/8191/9696 are taken).
- Public URL: `https://athleteos.dialedup.info` (Cloudflare Tunnel → 192.168.8.222:3020).
- Open Wearables API base: `http://192.168.8.222:8000/api/v1` (docs at
  `/docs`, OpenAPI at `/openapi.json`). The deployed backend is the
  `dial203/open-wearables` fork.
- Do not bind host ports other than 3020; everything else stays internal to the
  compose network.

## Open Wearables API facts (verified against this fork — trust these, not old notes)

- Page limit is **1000** (not 100) on `/timeseries`, `/summaries/sleep`,
  `/events/sleep`, `/events/workouts`, `/devices-history`; `/users` is 100.
- Sleep stage alphabet: `in_bed | awake | sleeping | light | deep | rem |
  unknown` — no N1/N2/N3. Fold manually imported reference stages from
  `vendor_stage` when present.
- Send `include_redundant_relays=true` when a comparison of sources matters;
  otherwise leave default.
- `/export/series` streams all raw rows for one user over a window (NDJSON/CSV),
  `end_time` exclusive — use it for bulk imports/backfills.
- `device_model_origin` is NOT exposed; there is no cross-device clock offset —
  lag search is AthleteOS's job.
- Pagination shape: `pagination.next_cursor` / `has_more` in the body root.
  Throw on `has_more` with no cursor; never stop silently.
- Auth: developer account via `/api/v1/auth/login`; create an application under
  `/api/v1/applications` and use its credentials for OAuth provider connection
  (providers: Garmin, Oura, and others via `/api/v1/oauth/providers`).

## Build order

1. Scaffold Next.js (App Router, TypeScript) + Postgres in docker-compose.
   App listens on **0.0.0.0:3020**.
2. OW integration layer: login, application bootstrap, provider OAuth connect
   page, fetchers for timeseries/sleep/workouts/devices with the paging rules
   above.
3. Data model (Postgres): `plan_phase`, `plan_session`, `manual_session`,
   `questionnaire_def`, `questionnaire_response`, `daily_wellness`,
   `settings`. Device data is NOT duplicated — read from OW on demand, cache
   modestly.
4. UI pillars in this order: dashboard shell → wearable views → plan calendar →
   history (plan vs actual) → questionnaire engine → readiness.
5. Healthcheck endpoint at `/api/health` returning `{status:"ok"}`.

## Conventions

- All dashboard numbers show their source device; never silently pick one.
- Open Wearables stays behind the scenes. Athletes see brands and "connected
  accounts" (Settings → Connected accounts); OW's name, user ids, application
  and provider setup appear only on the admin's Settings → Data backend and
  Credentials tabs. The OW user is created on an athlete's first connect
  (`lib/ow/provision.ts`), never asked for.
- The iPhone app (`ios/`) signs in at `POST /api/v1/auth/token` (email and
  password) or `POST /api/v1/auth/invite` (an invite or reset code from
  Settings → Users plus a new password, the same codes the web accepts). Its
  token is the user's own, so every `/api/v1` handler scopes by `ctx.athlete`.
  AthleteKit's models are generated from the route table
  (`src/lib/api/swift-gen.ts`); after an API change run
  `UPDATE_SWIFT=1 npx vitest run lib/api/swift-gen` and commit `ios/`.
- The phone's Apple Health sync runs OW's iOS SDK with a token minted per
  athlete (`POST /api/v1/wearables/sdk-token`). OW is LAN-only, so the SDK
  reaches it through `/ow/api/v1/*` (`lib/ow/sdk-proxy.ts`), which passes only
  the SDK's own paths and never an API key or cookie. Widen that allowlist only
  for a path the pinned SDK actually calls.
- HRV aggregates computed on log(RMSSD); display both raw and log-derived.
- Keep every tuning knob (lag tolerance, device priority, metric windows) in
  settings, not hardcoded.
- Credentials and secrets (OW, SMTP, sign-in, and any future integration) must
  be editable in Settings → Credentials, not only via `.env`. Add new ones to
  the registry in `src/lib/credentials.ts` and read them with `cred()`. Store
  them sealed (`lib/vault.ts`) and never send them back to the browser. Test
  them before saving, and require the current password to change them. `.env`
  is the fallback, plus the bootstrap-only `SESSION_SECRET`, first
  `ATHLETEOS_PASSWORD` and `DATABASE_URL`.
- Users and roles: each user owns one athlete. Pages and actions read the
  athlete through `getCtx()` (an admin may be viewing someone read-only; write
  actions go through `writeCtx()` in `actions.ts`, which refuses then). Anything
  admin-only calls `requireAdmin()` in its page and action and is listed in
  `ADMIN_PATHS` in `proxy.ts`. Searching the device backend and linking an
  existing backend account are admin-only.
- Comments explain why; no TODO left in a merged commit.

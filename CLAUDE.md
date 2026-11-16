# CLAUDE.md — build brief for AthleteOS

AthleteOS is an AMS-style (athlete management system) personal health/fitness
dashboard for a single user (family-ready later). **Open Wearables is the device
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
- HRV aggregates computed on log(RMSSD); display both raw and log-derived.
- Keep every tuning knob (lag tolerance, device priority, metric windows) in
  settings, not hardcoded.
- Comments explain why; no TODO left in a merged commit.

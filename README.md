# AthleteOS

**Your personal operating system for training and health.** An open-source, AMS-style
(Athlete Management System) personal dashboard that turns the data your wearables
already collect — plus a real training plan and daily questionnaires — into one
coherent picture of what you did, how you recovered, and what you should do next.

Built on [Open Wearables](https://github.com/dial203/open-wearables) as the backend:
every device (Garmin, Oura, Apple Health, Whoop, and anything else Open Wearables
ingests) flows through one API instead of a pile of vendor apps.

## Why

Consumer health apps show you *numbers*. Athlete management systems show you *the
athlete* — plan, load, recovery, and subjective state in one view, the way a
professional team's staff sees it. AthleteOS brings that to one person: you are
both the athlete and the coach.

## The five pillars

| Pillar | What it does |
|---|---|
| **Training Plan** | Periodized plan on a calendar — phases, sessions, prescribed intensity/volume, targets for the day |
| **Training History** | Every completed session, auto-ingested from wearables via Open Wearables plus manual logs; searchable, comparable |
| **Wearables** | Sleep stages, HRV, resting HR, respiratory rate, workouts, steps — one normalized stream from the Open Wearables API |
| **Questionnaires** | AMS-style daily wellness forms (fully configurable): soreness, mood, energy, sleep quality; any custom questionnaire you define |
| **Readiness & Trends** | The dashboard that makes it a system: today's plan vs. last night's recovery vs. this morning's wellness; long-term trends in each pillar |

## Principles

1. **One backend for devices.** Open Wearables owns all wearable ingestion and
   normalization. AthleteOS never talks to a vendor API directly.
2. **Subjective + objective.** Daily questionnaires sit next to device data as
   first-class data, not an afterthought.
3. **Research-grade defaults.** Where the science says so, the math follows it
   (e.g. HRV aggregated and analyzed on a log scale, agreed device-priority
   resolution when two devices report the same metric).
4. **Self-hosted, open-source, no subscription.** Runs on your own hardware in
   Docker; your data stays yours.
5. **Extensible.** Questionnaire definitions, dashboard widgets, and readiness
   rules are data, not code.

## Architecture

```
Wearable vendors ──▶ Open Wearables (ingest + normalize)
                          │  REST /api/v1
                          ▼
             AthleteOS app (Next.js + Postgres)
             ├── training plan & history
             ├── questionnaire engine
             ├── readiness dashboard
             └── device data views (timeseries, sleep, workouts)
                          │
                          ▼
                 Docker on your homelab, exposed via Cloudflare Tunnel
```

## Status

Alpha. All five pillars are implemented: dashboard, wearable views (recovery, sleep with
hypnograms, timeseries explorer, device agreement, devices), plan calendar with phases,
history (plan vs actual), questionnaire engine, and readiness. Family mode is not built yet;
every table is already keyed by athlete.

## Deploy (homelab)

Merging to `main` is the deploy step (CI publishes the image; see DEPLOY.md). For a
first install or a local source build:

```bash
cd /opt/data/docker/athleteos
cp .env.example .env   # set ATHLETEOS_PASSWORD and SESSION_SECRET; everything else can be entered in the app
docker compose up -d
curl -s localhost:3020/api/health   # {"status":"ok"}
```

On first start the app migrates Postgres and seeds one athlete plus two questionnaires
(McLean-style morning wellness, weekly check-in). Then, in the app:

1. **Settings → Credentials**: Open Wearables URL and API key (or developer login),
   SMTP for emailed codes, push contact. Each is tested before it is saved.
2. **Settings → Open Wearables**: link your OW user (search by name) and, if you want,
   create the AthleteOS application and connect providers.
3. **Settings → Device priority**: rank devices per metric (HRV, RHR, sleep, respiratory rate,
   SpO₂, workouts). Unranked devices fall back to the one with the most data and are labelled.
4. **Settings → Analysis**: windows, SWC, load unit, ACWR model, lag tolerance, readiness weights.

## Dashboards

| Page | What it answers |
|---|---|
| **Today** | Plan, last night per device, check-in, readiness; an illness-watch notice when signals agree |
| **Readiness** | Each pillar against your own baseline, with methods and references |
| **Weekly review** | Plan vs delivered, load and monotony, HRV mean/CV, RHR, sleep amount and timing, wellness vs previous weeks |
| **Trends** | Weekly load, HRV, RHR, sleep, VO₂max and body mass over 3–12 months, per device |
| **History → Time in zone** | Share of recorded time in heart-rate, running-pace, running-power and cycling-power zones (presets from LTHR/HRmax, threshold pace, CP, FTP, or custom) |
| **History → Intensity** | Time in three HR zones per week and session, Polarization-Index |
| **Readiness → Illness watch** | Nightly RHR, respiratory rate, skin temperature and HRV deviations vs a lagged baseline |
| **Wearables → Coverage** | Which devices reported each night, baseline-device gaps, provider sync, questionnaire adherence |

Every dashboard is also an API endpoint (`/review`, `/trends`, `/zones`, `/intensity`, `/illness`, `/coverage`).

## Credentials in the app

Settings → Credentials holds the Open Wearables URL and API key (or developer
login), the SMTP settings and the push contact. Settings → Security holds the
sign-in password and emailed codes. Nothing needs a restart.

- **Stored sealed.** Values are AES-256-GCM encrypted in Postgres with a key
  derived from `SESSION_SECRET`, so a database dump alone doesn't reveal them.
  The OW application secret is kept the same way. The sign-in password is kept
  only as a scrypt hash. Secrets are write-only: after saving, the page shows at
  most the last four characters of a key.
- **App over `.env`.** A value saved in the app wins. Remove it and the `.env`
  value applies again, so an existing `.env` keeps working unchanged. Only
  `SESSION_SECRET`, the first `ATHLETEOS_PASSWORD` and the database password have
  to live in `.env`.
- **Tested before saving.** Open Wearables settings are tried with one signed-in
  request, and SMTP with a login to the mail server (nothing is sent). Settings
  that fail aren't stored unless you tick "Save without testing".
- **Your password guards every change.** A stolen session cookie can't point the
  stored keys at another server.
- **Changing `SESSION_SECRET`** makes saved values unreadable. The page says so,
  and sign-in falls back to `ATHLETEOS_PASSWORD`.

## Sign-in codes by email (optional second factor)

Set up email in Settings → Credentials. Then turn codes on in Settings → Security:
a confirmation code goes to the address first, so a typo can't lock you out.
Signing in then needs the password plus a 6-digit code. Codes expire in 10 minutes
and allow 5 tries, and only a keyed hash of each code is stored. A device you
choose to trust skips the code for 30 days.

Settings → Security also covers the rest:
- change the password, which signs out every other device;
- sign out other devices;
- forget every trusted device.

Native apps get the same check: `POST /api/v1/auth/token` returns a
`challengeId`, then `POST /api/v1/auth/token/verify` exchanges the emailed code
for a token.

**Locked out?**
- If email broke while codes were on, set `LOGIN_2FA=off` in the server
  environment (Portainer stack env or `.env`) and restart. It overrides the app
  setting.
- If you forgot a password you set in the app, remove the stored hash so
  `ATHLETEOS_PASSWORD` applies again:

```bash
docker exec athleteos-db psql -U athleteos -c "DELETE FROM credential WHERE name = 'APP_PASSWORD_HASH'"
```

## Phone: install as an app (PWA)

Open `https://athleteos.dialedup.info` on your phone and add it to the home screen
(iPhone: Share → Add to Home Screen; Android: the browser offers Install). Then
Settings → Notifications → **Turn on reminders on this device**. A morning check-in
reminder is sent once a day, only while a daily form is unanswered (time is set there).
On iPhone, notifications work only from the installed app (iOS 16.4+).

The service worker caches static assets and an offline page only; pages and API
responses (your health data) are never cached on the device.

## API (for native apps and scripts)

A versioned JSON API lives at `/api/v1`, described by `/api/v1/openapi.json`
(generate a typed client from it). Authenticate with `Authorization: Bearer <token>`:
create tokens in Settings → API tokens, or have an app sign in with
`POST /api/v1/auth/token` and the AthleteOS password. Tokens are stored hashed and
can be revoked. The web app and the API share one domain layer, so they validate
and behave identically.

```bash
curl -s -H "Authorization: Bearer $TOKEN" https://athleteos.dialedup.info/api/v1/today
```

## How the numbers are made

- **Device data is never copied into Postgres.** It is read from Open Wearables on demand
  (whole calendar months, in parallel, cached in memory for a few minutes; settled months longer).
- **Every number shows its device.** A primary value is picked by your priority; the other
  devices' values sit beside it. Baselines use one device only.
- **HRV** is aggregated on ln(RMSSD): 7-day rolling mean vs 60-day baseline ± 0.5 SD.
- **Load** is sRPE by default (rate sessions on History). ACWR by EWMA or uncoupled rolling.
- **Multi-device workouts** (watch + strap + ring recording one run) are grouped by time overlap
  and counted once. Overnight captures and very short or very long recordings can be excluded.
- **Device agreement** (Wearables → Compare): lag search within a tolerance, then Bland-Altman,
  CCC, MAE/RMSE and TOST, with CIs on an autocorrelation-corrected effective n.

The Readiness page lists the methods and the papers behind them.

## Develop

```bash
cd src
npm install
npm test            # unit tests (the live API contract test is skipped without a server)
API_BASE=http://127.0.0.1:3020 API_PASSWORD=... npx vitest run lib/api/contract.test.ts
npm run typecheck
DATABASE_URL=postgresql://... SESSION_SECRET=$(openssl rand -base64 48) ATHLETEOS_PASSWORD=dev npm run dev
# then add Open Wearables in Settings → Credentials (or set OW_API_BASE / OW_API_KEY)
```

Layout: `src/lib/ow` (Open Wearables client and fetchers), `src/lib/stats` (pure analysis),
`src/lib/domain` (repositories and assembly), `src/app` (Next.js App Router pages and server
actions), `src/components`.

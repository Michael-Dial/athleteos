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

```bash
cd /opt/data/docker/athleteos
cp .env.example .env   # set ATHLETEOS_PASSWORD, SESSION_SECRET, OW_API_KEY (or OW_EMAIL/OW_PASSWORD)
docker compose up -d --build
curl -s localhost:3020/api/health   # {"status":"ok"}
```

On first start the app migrates Postgres and seeds one athlete plus two questionnaires
(McLean-style morning wellness, weekly check-in). Then, in the app:

1. **Settings → Open Wearables**: link your OW user (search by name) and, if you want,
   create the AthleteOS application and connect providers.
2. **Settings → Device priority**: rank devices per metric (HRV, RHR, sleep, respiratory rate,
   SpO₂, workouts). Unranked devices fall back to the one with the most data and are labelled.
3. **Settings → Analysis**: windows, SWC, load unit, ACWR model, lag tolerance, readiness weights.

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
npm test            # vitest: stats, paging, auth, questionnaire engine, dates
npm run typecheck
DATABASE_URL=postgresql://... OW_API_BASE=... OW_API_KEY=... \
  SESSION_SECRET=$(openssl rand -base64 48) ATHLETEOS_PASSWORD=dev npm run dev
```

Layout: `src/lib/ow` (Open Wearables client and fetchers), `src/lib/stats` (pure analysis),
`src/lib/domain` (repositories and assembly), `src/app` (Next.js App Router pages and server
actions), `src/components`.

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

Pre-alpha — the grand vision is published; implementation proceeds phase by phase
(see [VISION.md](VISION.md)). Contributions and forks welcome.

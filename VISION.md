# AthleteOS — the grand vision

One person's complete athlete-management system: the training plan, the completed
work, the wearable record, the daily subjective check-in, and the readiness math
that ties them together — all self-hosted, all built on Open Wearables for device
data.

## The problem

Every existing tool covers one slice:

- **Training platforms** (TrainingPeaks, Final Surge) hold the plan but barely
  read wearables.
- **Wearable apps** (Garmin Connect, Oura) show device data but know nothing
  about your plan.
- **AMS platforms** (Smartabase, Kitman Labs) combine both, but are enterprise
  products priced and shaped for teams, not a person.

AthleteOS is the missing piece: an AMS for one. It assumes you wear devices, you
follow a plan, you answer a morning wellness form, and you want all three on one
screen every day — and a history that compounds for years.

## What it becomes, phase by phase

### Phase 1 — Foundation
- Next.js app + Postgres, deployed on the homelab Docker host (port **3020**),
  exposed via Cloudflare Tunnel at `athleteos.michaeldialphd.com`.
- Open Wearables integration: OAuth-connect the user's providers, pull
  timeseries, sleep summaries/events, workouts, and devices-history.
- Single-user (family-ready) auth.

### Phase 2 — Plan & history
- Training plan calendar: phases → weeks → sessions with prescribed sport,
  duration, intensity zones, notes.
- Auto-populated training history: completed workouts ingested from Open
  Wearables appear alongside planned sessions; mark manual sessions too.
- Plan-vs-actual view: prescribed load vs. delivered load, week by week.

### Phase 3 — Questionnaire engine
- Configurable daily wellness forms (AMS-style: sleep quality, fatigue, muscle
  soreness, stress, mood — but any fields you want).
- Scheduling (morning prompt), streaks, and per-question trend charts.
- Responses are queryable data joined to the day's device record.

### Phase 4 — Readiness & trends
- Daily readiness view: plan for today × last night's sleep × morning wellness ×
  7/28-day load (ACWR-style) in one screen.
- Long-term trends per pillar; metric-level device comparison hooks (Open
  Wearables stores every source; agreed-priority resolution is configurable).
- Analysis built the way the research does it: log-scale HRV aggregation, lag
  tolerance when devices disagree on timing, and honest flagging of which device
  produced each number.

### Phase 5 — Extensibility
- Questionnaire templates, dashboard widgets, and readiness rules as data
  (import/export JSON).
- Multi-user family mode.
- Optional researcher exports (the same bulk-export discipline the validation
  hub uses).

## Non-goals

- No direct vendor API calls — Open Wearables is the single device backend.
- No medical advice, no diagnostic claims.
- No cloud dependency for function: the tunnel is convenience, not a requirement.

## Where it runs

| Piece | Location |
|---|---|
| AthleteOS app | Docker on the homelab CT (`192.168.8.222`), port **3020** |
| Open Wearables backend | Already running at `http://192.168.8.222:8000` (API at `/api/v1`) |
| Public URL | `https://athleteos.michaeldialphd.com` via Cloudflare Tunnel |
| Source | `github.com/Michael-Dial/athleteos` (public) |

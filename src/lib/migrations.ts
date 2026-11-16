// Ordered, append-only schema migrations. Never edit a shipped entry: add a new
// one, because deployed databases have already recorded the old version number.
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [
  {
    version: 1,
    name: "core schema",
    sql: `
CREATE TABLE athlete (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  -- Open Wearables user id; nullable so the app boots before OW is linked.
  ow_user_id  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Per-athlete tuning knobs (lag tolerance, device priority, windows...).
CREATE TABLE settings (
  athlete_id  int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  key         text NOT NULL,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, key)
);

-- Install-wide values that belong to no athlete (OW application credentials).
CREATE TABLE system_kv (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE plan_phase (
  id          serial PRIMARY KEY,
  athlete_id  int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  name        text NOT NULL,
  kind        text NOT NULL DEFAULT 'build',
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  goal        text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CHECK (end_date >= start_date)
);
CREATE INDEX plan_phase_range ON plan_phase (athlete_id, start_date, end_date);

CREATE TABLE plan_session (
  id                   serial PRIMARY KEY,
  athlete_id           int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  phase_id             int  REFERENCES plan_phase(id) ON DELETE SET NULL,
  date                 date NOT NULL,
  sport                text NOT NULL,
  title                text NOT NULL,
  description          text,
  intensity            text,
  planned_duration_min numeric(6,1),
  planned_distance_km  numeric(7,2),
  planned_rpe          numeric(3,1) CHECK (planned_rpe BETWEEN 0 AND 10),
  -- Explicit link to the OW workout that fulfilled this session; when null the
  -- history view proposes a match by date + sport + time tolerance.
  ow_workout_id        text,
  skipped              boolean NOT NULL DEFAULT false,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX plan_session_date ON plan_session (athlete_id, date);

-- Either a session logged by hand (no device) or an annotation (RPE, notes)
-- attached to a device workout via ow_workout_id.
CREATE TABLE manual_session (
  id               serial PRIMARY KEY,
  athlete_id       int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  date             date NOT NULL,
  start_time       timestamptz,
  sport            text NOT NULL,
  title            text,
  duration_min     numeric(6,1) NOT NULL CHECK (duration_min >= 0),
  distance_km      numeric(7,2),
  rpe              numeric(3,1) CHECK (rpe BETWEEN 0 AND 10),
  ow_workout_id    text,
  plan_session_id  int REFERENCES plan_session(id) ON DELETE SET NULL,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX manual_session_date ON manual_session (athlete_id, date);
CREATE UNIQUE INDEX manual_session_ow ON manual_session (athlete_id, ow_workout_id)
  WHERE ow_workout_id IS NOT NULL;

CREATE TABLE questionnaire_def (
  id           serial PRIMARY KEY,
  athlete_id   int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  slug         text NOT NULL,
  name         text NOT NULL,
  description  text,
  -- 'wellness' responses also feed daily_wellness and readiness.
  kind         text NOT NULL DEFAULT 'custom' CHECK (kind IN ('wellness','custom')),
  schedule     text NOT NULL DEFAULT 'daily' CHECK (schedule IN ('daily','weekly','adhoc')),
  items        jsonb NOT NULL,
  version      int  NOT NULL DEFAULT 1,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (athlete_id, slug)
);

CREATE TABLE questionnaire_response (
  id            serial PRIMARY KEY,
  def_id        int  NOT NULL REFERENCES questionnaire_def(id) ON DELETE CASCADE,
  athlete_id    int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  date          date NOT NULL,
  -- Items can change between versions; keep the version answered so old
  -- responses are interpreted against the items that were actually asked.
  def_version   int  NOT NULL,
  items_snapshot jsonb NOT NULL,
  answers       jsonb NOT NULL,
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (def_id, date)
);
CREATE INDEX questionnaire_response_date ON questionnaire_response (athlete_id, date);

CREATE TABLE daily_wellness (
  athlete_id   int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  date         date NOT NULL,
  response_id  int  REFERENCES questionnaire_response(id) ON DELETE CASCADE,
  -- Per-item scores rescaled to 0..1 with 1 = favourable, so items with
  -- different anchors and directions can be averaged.
  item_scores  jsonb NOT NULL,
  composite    numeric(5,2) NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, date)
);
`,
  },
  {
    version: 2,
    name: "exclude device workouts from training",
    sql: `
-- Lets an annotation drop a device recording from load and plan matching
-- (e.g. an overnight capture logged as a workout) without deleting it in OW.
ALTER TABLE manual_session ADD COLUMN excluded boolean NOT NULL DEFAULT false;
`,
  },
];

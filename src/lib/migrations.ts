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
  {
    version: 3,
    name: "api tokens and push subscriptions",
    sql: `
-- Bearer tokens for the JSON API (native apps, scripts). Only a SHA-256 of
-- the token is stored; the token itself is shown once at creation.
CREATE TABLE api_token (
  id            serial PRIMARY KEY,
  athlete_id    int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  name          text NOT NULL,
  token_hash    text NOT NULL UNIQUE,
  prefix        text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
CREATE INDEX api_token_athlete ON api_token (athlete_id);

-- Web Push subscriptions (one per browser/device that enabled reminders).
CREATE TABLE push_subscription (
  id            serial PRIMARY KEY,
  athlete_id    int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  endpoint      text NOT NULL UNIQUE,
  p256dh        text NOT NULL,
  auth          text NOT NULL,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_success_at timestamptz,
  failures      int  NOT NULL DEFAULT 0
);

-- One row per reminder actually sent, so a restart never double-sends.
CREATE TABLE reminder_log (
  athlete_id    int  NOT NULL REFERENCES athlete(id) ON DELETE CASCADE,
  kind          text NOT NULL,
  date          date NOT NULL,
  sent_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (athlete_id, kind, date)
);
`,
  },
  {
    version: 4,
    name: "email sign-in challenges",
    sql: `
-- One pending second-factor check. Only an HMAC of the code is stored; codes
-- expire, allow a few attempts, and can be resent a limited number of times.
CREATE TABLE auth_challenge (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  purpose       text NOT NULL CHECK (purpose IN ('web', 'token')),
  code_hash     text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL,
  attempts      int NOT NULL DEFAULT 0,
  sends         int NOT NULL DEFAULT 1,
  last_sent_at  timestamptz NOT NULL DEFAULT now(),
  consumed_at   timestamptz,
  ip            text,
  meta          jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX auth_challenge_expires ON auth_challenge (expires_at);
`,
  },
  {
    version: 5,
    name: "credential store",
    sql: `
-- Credentials entered in Settings. Each value is AES-256-GCM sealed with a key
-- derived from SESSION_SECRET, so a database dump alone doesn't reveal them.
CREATE TABLE credential (
  name        text PRIMARY KEY,
  sealed      text NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- 'setup' codes confirm the address before emailed sign-in codes are switched on.
ALTER TABLE auth_challenge DROP CONSTRAINT auth_challenge_purpose_check;
ALTER TABLE auth_challenge ADD CONSTRAINT auth_challenge_purpose_check CHECK (purpose IN ('web', 'token', 'setup'));
`,
  },
  {
    version: 6,
    name: "phone sync pairing code",
    sql: `
-- The code an athlete types into the phone sync app (Apple Health, Health
-- Connect) to pair it with their device-data account. Sealed like the
-- credential store (lib/vault.ts), bound to the athlete row by its AAD.
ALTER TABLE athlete ADD COLUMN phone_code_sealed text;
`,
  },
  {
    version: 7,
    name: "users and roles",
    sql: `
-- One sign-in per person. Each user owns exactly one athlete (their data);
-- admins also manage users, credentials and the device backend. The first
-- admin is created on the first sign-in after this migration (lib/signin.ts),
-- from the password the install already used.
CREATE TABLE app_user (
  id             serial PRIMARY KEY,
  athlete_id     int  NOT NULL UNIQUE REFERENCES athlete(id) ON DELETE CASCADE,
  email          text NOT NULL,
  role           text NOT NULL CHECK (role IN ('admin', 'member')),
  -- scrypt; NULL until an invited user sets one.
  password_hash  text,
  login_codes    boolean NOT NULL DEFAULT false,
  -- Bumping either ends that user's sessions / trusted devices only.
  session_epoch  int NOT NULL DEFAULT 0,
  trust_epoch    int NOT NULL DEFAULT 0,
  disabled_at    timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  last_login_at  timestamptz
);
CREATE UNIQUE INDEX app_user_email ON app_user (lower(email));

-- Invite and password-reset links. Only a SHA-256 of the token is stored.
CREATE TABLE user_link (
  token_hash   text PRIMARY KEY,
  user_id      int  NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('invite', 'reset')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz
);

-- Sign-in codes belong to the user signing in.
ALTER TABLE auth_challenge ADD COLUMN user_id int REFERENCES app_user(id) ON DELETE CASCADE;
DELETE FROM auth_challenge;

-- One device-data account per athlete, so linking can't show one person's
-- data under two users.
CREATE UNIQUE INDEX athlete_ow_user ON athlete (ow_user_id) WHERE ow_user_id IS NOT NULL;

-- Replaced by per-user epochs.
DELETE FROM system_kv WHERE key IN ('session_epoch', 'trust_epoch');
`,
  },
];

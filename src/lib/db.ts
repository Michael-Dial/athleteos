import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { MIGRATIONS } from "./migrations";
import { DEFAULT_QUESTIONNAIRES } from "./domain/questionnaire-templates";

// pg returns DATE as a JS Date in local time, which shifts calendar days across
// timezones. Calendar dates are kept as 'YYYY-MM-DD' strings everywhere.
import { types } from "pg";
types.setTypeParser(1082, (v: string) => v);
// numeric -> number; values here are small (durations, RPE), well inside double precision.
types.setTypeParser(1700, (v: string) => Number(v));

const g = globalThis as unknown as { __aosPool?: Pool; __aosReady?: Promise<void> };

function pool(): Pool {
  if (!g.__aosPool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is not set");
    g.__aosPool = new Pool({ connectionString, max: 10 });
  }
  return g.__aosPool;
}

async function migrate(): Promise<void> {
  const client = await pool().connect();
  try {
    // Advisory lock so two app replicas starting together don't race.
    await client.query("SELECT pg_advisory_lock(72020)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (version int PRIMARY KEY, name text, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    const { rows } = await client.query<{ version: number }>("SELECT version FROM schema_migrations");
    const done = new Set(rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (done.has(m.version)) continue;
      await client.query("BEGIN");
      try {
        await client.query(m.sql);
        await client.query("INSERT INTO schema_migrations (version, name) VALUES ($1, $2)", [m.version, m.name]);
        await client.query("COMMIT");
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      }
    }
    await seed(client);
  } finally {
    await client.query("SELECT pg_advisory_unlock(72020)").catch(() => undefined);
    client.release();
  }
}

// First-run seed: one athlete plus the default wellness questionnaire, so the
// dashboard is usable immediately after `docker compose up`. Its user (the
// first admin) is created at the first sign-in.
async function seed(client: PoolClient): Promise<void> {
  const { rows } = await client.query<{ n: number }>("SELECT count(*)::int AS n FROM athlete");
  if (rows[0].n > 0) return;
  const owUser = process.env.OW_USER_ID || null;
  const name = process.env.ATHLETE_NAME || "Athlete";
  const ins = await client.query<{ id: number }>(
    "INSERT INTO athlete (name, ow_user_id) VALUES ($1, $2) RETURNING id",
    [name, owUser],
  );
  await seedQuestionnaires(client, ins.rows[0].id);
}

/** Default questionnaires for a new athlete (first run, or a newly invited user). */
export async function seedQuestionnaires(client: PoolClient, athleteId: number): Promise<void> {
  for (const q of DEFAULT_QUESTIONNAIRES) {
    await client.query(
      `INSERT INTO questionnaire_def (athlete_id, slug, name, description, kind, schedule, items)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [athleteId, q.slug, q.name, q.description, q.kind, q.schedule, JSON.stringify(q.items)],
    );
  }
}

export function ready(): Promise<void> {
  if (!g.__aosReady) {
    g.__aosReady = migrate().catch((e) => {
      // Allow a retry on the next request instead of caching the failure forever.
      g.__aosReady = undefined;
      throw e;
    });
  }
  return g.__aosReady;
}

export async function q<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const res = await pool().query<T>(sql, params);
  return res.rows;
}

export async function q1<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []): Promise<T | null> {
  const rows = await q<T>(sql, params);
  return rows[0] ?? null;
}

export async function tx<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  await ready();
  const client = await pool().connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function ping(): Promise<boolean> {
  try {
    await pool().query("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

import { q, q1 } from "./db";

// The session epoch lives in system_kv and is read on every gated request by
// proxy.ts, so it is cached briefly. A bump in this process updates the cache
// at once; another replica notices within EPOCH_TTL_MS.
const EPOCH_TTL_MS = 5_000;
const g = globalThis as unknown as { __aosSessionEpoch?: { value: number; at: number } };

export async function sessionEpoch(): Promise<number> {
  const c = g.__aosSessionEpoch;
  if (c && Date.now() - c.at < EPOCH_TTL_MS) return c.value;
  const r = await q1<{ value: number }>("SELECT value FROM system_kv WHERE key = 'session_epoch'");
  const value = r ? Number(r.value) : 0;
  g.__aosSessionEpoch = { value, at: Date.now() };
  return value;
}

/** End every existing session; returns the new epoch for re-issuing the caller's own cookie. */
export async function bumpSessionEpoch(): Promise<number> {
  const rows = await q<{ value: number }>(
    `INSERT INTO system_kv (key, value) VALUES ('session_epoch', '1')
     ON CONFLICT (key) DO UPDATE SET value = to_jsonb((system_kv.value)::text::int + 1), updated_at = now()
     RETURNING value`);
  const value = Number(rows[0].value);
  g.__aosSessionEpoch = { value, at: Date.now() };
  return value;
}

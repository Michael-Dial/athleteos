import "server-only";
import { randomInt } from "node:crypto";
import { codeHash, timingSafeEqual } from "./auth";
import { q, q1 } from "./db";

export const CODE_TTL_MIN = 10;
export const MAX_ATTEMPTS = 5;
export const MAX_SENDS = 5;
export const RESEND_GAP_SEC = 60;

function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** web/token: second factor at sign-in. setup: confirms an address before codes are switched on. */
export type ChallengePurpose = "web" | "token" | "setup";

export interface Challenge {
  id: string;
  purpose: ChallengePurpose;
  meta: Record<string, string>;
}

/** Start a challenge; returns the plaintext code for sending (never stored). */
export async function createChallenge(purpose: ChallengePurpose, ip: string, meta: Record<string, string>): Promise<{ id: string; code: string }> {
  // Opportunistic cleanup keeps the table to recent rows.
  await q("DELETE FROM auth_challenge WHERE expires_at < now() - interval '1 day'");
  const row = await q1<{ id: string }>(
    `INSERT INTO auth_challenge (purpose, code_hash, expires_at, ip, meta)
     VALUES ($1, 'pending', now() + make_interval(mins => $2), $3, $4) RETURNING id`,
    [purpose, CODE_TTL_MIN, ip, JSON.stringify(meta)],
  );
  const code = newCode();
  await q("UPDATE auth_challenge SET code_hash = $1 WHERE id = $2", [await codeHash(row!.id, code), row!.id]);
  return { id: row!.id, code };
}

export type VerifyResult = { ok: true; challenge: Challenge } | { ok: false; reason: "invalid" | "expired" | "locked" | "unknown" };

const UUID = /^[0-9a-f-]{36}$/i;

export async function verifyChallenge(id: string | undefined, code: string, purpose: ChallengePurpose): Promise<VerifyResult> {
  if (!id || !UUID.test(id)) return { ok: false, reason: "unknown" };
  const c = await q1<{ id: string; purpose: ChallengePurpose; code_hash: string; expired: boolean; attempts: number; consumed: boolean; meta: Record<string, string> }>(
    `SELECT id, purpose, code_hash, expires_at < now() AS expired, attempts, consumed_at IS NOT NULL AS consumed, meta
     FROM auth_challenge WHERE id = $1`, [id]);
  if (!c || c.purpose !== purpose || c.consumed) return { ok: false, reason: "unknown" };
  if (c.expired) return { ok: false, reason: "expired" };
  if (c.attempts >= MAX_ATTEMPTS) return { ok: false, reason: "locked" };
  // Count the attempt before comparing, so parallel guesses can't exceed the limit.
  const counted = await q1<{ attempts: number }>(
    "UPDATE auth_challenge SET attempts = attempts + 1 WHERE id = $1 AND attempts < $2 AND consumed_at IS NULL RETURNING attempts",
    [id, MAX_ATTEMPTS]);
  if (!counted) return { ok: false, reason: "locked" };
  const clean = code.replace(/\D/g, "");
  if (clean.length !== 6 || !timingSafeEqual(await codeHash(id, clean), c.code_hash)) {
    return { ok: false, reason: counted.attempts >= MAX_ATTEMPTS ? "locked" : "invalid" };
  }
  const used = await q1("UPDATE auth_challenge SET consumed_at = now() WHERE id = $1 AND consumed_at IS NULL RETURNING id", [id]);
  if (!used) return { ok: false, reason: "unknown" };
  return { ok: true, challenge: { id: c.id, purpose: c.purpose, meta: c.meta } };
}

export type ResendResult = { ok: true; code: string; meta: Record<string, string> } | { ok: false; reason: "unknown" | "too_soon" | "too_many"; waitSec?: number };

/** New code for a live challenge (the old one stops working); rate limited. */
export async function resendChallenge(id: string | undefined, purpose: ChallengePurpose): Promise<ResendResult> {
  if (!id || !UUID.test(id)) return { ok: false, reason: "unknown" };
  const c = await q1<{ sends: number; since: number; meta: Record<string, string> }>(
    `SELECT sends, EXTRACT(EPOCH FROM now() - last_sent_at)::int AS since, meta FROM auth_challenge
     WHERE id = $1 AND purpose = $2 AND consumed_at IS NULL AND expires_at > now()`, [id, purpose]);
  if (!c) return { ok: false, reason: "unknown" };
  if (c.sends >= MAX_SENDS) return { ok: false, reason: "too_many" };
  if (c.since < RESEND_GAP_SEC) return { ok: false, reason: "too_soon", waitSec: RESEND_GAP_SEC - c.since };
  const code = newCode();
  await q(
    `UPDATE auth_challenge SET code_hash = $1, sends = sends + 1, last_sent_at = now(), attempts = 0,
       expires_at = now() + make_interval(mins => $2) WHERE id = $3`,
    [await codeHash(id, code), CODE_TTL_MIN, id]);
  return { ok: true, code, meta: c.meta };
}

export async function trustEpoch(): Promise<number> {
  const r = await q1<{ value: number }>("SELECT value FROM system_kv WHERE key = 'trust_epoch'");
  return r ? Number(r.value) : 0;
}

/** Invalidate every trusted device; each must enter a code at its next sign-in. */
export async function forgetTrustedDevices(): Promise<void> {
  await q(
    `INSERT INTO system_kv (key, value) VALUES ('trust_epoch', '1')
     ON CONFLICT (key) DO UPDATE SET value = to_jsonb((system_kv.value)::text::int + 1), updated_at = now()`);
}

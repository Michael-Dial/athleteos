import { readSessionToken } from "./auth";
import { q1 } from "./db";

// Checked on every gated request by proxy.ts, so kept free of "server-only"
// and cached briefly. Changes made in this process (sign out, disable) clear
// the entry at once; another replica sees them within STATE_TTL_MS.
const STATE_TTL_MS = 5_000;

interface State {
  epoch: number;
  active: boolean;
  admin: boolean;
}
const g = globalThis as unknown as { __aosUserState?: Map<number, { s: State | null; at: number }> };
const cache = (g.__aosUserState ??= new Map());

async function userState(userId: number): Promise<State | null> {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < STATE_TTL_MS) return hit.s;
  const row = await q1<{ session_epoch: number; disabled: boolean; role: string }>(
    "SELECT session_epoch, disabled_at IS NOT NULL AS disabled, role FROM app_user WHERE id = $1", [userId]);
  const s = row ? { epoch: row.session_epoch, active: !row.disabled, admin: row.role === "admin" } : null;
  if (cache.size > 500) cache.clear();
  cache.set(userId, { s, at: Date.now() });
  return s;
}

export function forgetUserState(userId: number): void {
  cache.delete(userId);
}

/** The signed-in user, if the cookie is genuine, current and the user is active. */
export async function sessionUser(token: string | undefined): Promise<{ id: number; admin: boolean } | null> {
  const t = await readSessionToken(token);
  if (!t) return null;
  const s = await userState(t.userId);
  return s && s.active && s.epoch === t.epoch ? { id: t.userId, admin: s.admin } : null;
}

export async function sessionUserId(token: string | undefined): Promise<number | null> {
  return (await sessionUser(token))?.id ?? null;
}

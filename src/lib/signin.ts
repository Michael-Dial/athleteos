import "server-only";
import { hmac, timingSafeEqual } from "./auth";
import { cred, stored, writeCredentials } from "./credentials";
import { q1, tx } from "./db";
import { EMAIL_RE, touchLogin, userByEmail, userById, type User } from "./users";
import { hashPassword, verifyPassword } from "./vault";

export const MIN_PASSWORD_LENGTH = 12;

// A hash to verify against when the email is unknown, so an unknown address
// takes as long as a wrong password and can't be told apart by timing.
let decoy: Promise<string> | null = null;

/**
 * The install's password from before per-user sign-in: one set in the app
 * (credential APP_PASSWORD_HASH) or ATHLETEOS_PASSWORD. It converts the
 * install into its first admin, and it is the recovery path for an admin
 * whose password was cleared.
 */
async function checkInstallPassword(candidate: string): Promise<boolean> {
  const hash = await stored("APP_PASSWORD_HASH");
  if (hash) return verifyPassword(candidate, hash);
  const expected = process.env.ATHLETEOS_PASSWORD;
  if (!expected) return false;
  const [a, b] = await Promise.all([hmac(`pw:${candidate}`), hmac(`pw:${expected}`)]);
  return timingSafeEqual(a, b);
}

/** True before anyone has signed in under per-user accounts. */
export async function needsFirstAdmin(): Promise<boolean> {
  return (await q1<{ n: number }>("SELECT count(*)::int AS n FROM app_user"))!.n === 0;
}

export async function installPasswordSet(): Promise<boolean> {
  return Boolean((await stored("APP_PASSWORD_HASH")) || process.env.ATHLETEOS_PASSWORD);
}

export type SignInResult = { ok: true; user: User } | { ok: false; reason: "bad" | "email_mismatch" };

/**
 * Check an email and password. On an install with no users yet, the install
 * password creates the first admin with the email given, owning the existing
 * athlete. When emailed codes were already on, that email must be the one the
 * codes went to; otherwise someone holding only the password could name their
 * own inbox and receive the code.
 */
export async function signIn(email: string, password: string): Promise<SignInResult> {
  const addr = email.trim();
  if (!EMAIL_RE.test(addr) || !password) return { ok: false, reason: "bad" };

  if (await needsFirstAdmin()) {
    if (!(await checkInstallPassword(password))) return { ok: false, reason: "bad" };
    const legacyEmail = await cred("LOGIN_EMAIL");
    if (legacyEmail && legacyEmail.toLowerCase() !== addr.toLowerCase()) return { ok: false, reason: "email_mismatch" };
    // Codes carry over only with the address they went to; without one they never worked.
    const codesWereOn = Boolean(legacyEmail) && !codesForcedOff() && (await cred("LOGIN_2FA")) === "email";
    const hash = await hashPassword(password);
    const id = await tx(async (c) => {
      // Serialise concurrent first sign-ins; the loser finds the admin already there.
      await c.query("SELECT pg_advisory_xact_lock(72021)");
      const existing = (await c.query<{ id: number }>("SELECT id FROM app_user ORDER BY id LIMIT 1")).rows[0];
      if (existing) return null;
      const athlete = (await c.query<{ id: number }>("SELECT id FROM athlete ORDER BY id LIMIT 1")).rows[0];
      if (!athlete) throw new Error("No athlete row; database seed did not run");
      return (await c.query<{ id: number }>(
        "INSERT INTO app_user (athlete_id, email, role, password_hash, login_codes) VALUES ($1, $2, 'admin', $3, $4) RETURNING id",
        [athlete.id, addr, hash, codesWereOn])).rows[0].id;
    });
    if (id === null) return signIn(email, password);
    // The install-wide password and code settings now live on the admin's account.
    await writeCredentials({ APP_PASSWORD_HASH: null, LOGIN_2FA: null, LOGIN_EMAIL: null });
    await touchLogin(id);
    return { ok: true, user: (await userById(id))! };
  }

  const u = await userByEmail(addr);
  if (!u || u.disabled) {
    await verifyPassword(password, await (decoy ??= hashPassword("decoy-password-for-timing")));
    return { ok: false, reason: "bad" };
  }
  let good: boolean;
  if (u.password_hash) good = await verifyPassword(password, u.password_hash);
  // Recovery: an admin whose password was cleared in the database signs in with the install password.
  else good = u.role === "admin" && (await checkInstallPassword(password));
  if (!good) return { ok: false, reason: "bad" };
  await touchLogin(u.id);
  const { password_hash: _drop, ...user } = u;
  return { ok: true, user };
}

/** Re-check the signed-in user's own password before a sensitive change. */
export async function confirmPassword(user: User, candidate: string): Promise<boolean> {
  const row = await q1<{ password_hash: string | null }>("SELECT password_hash FROM app_user WHERE id = $1", [user.id]);
  if (row?.password_hash) return verifyPassword(candidate, row.password_hash);
  return user.role === "admin" && (await checkInstallPassword(candidate));
}

/**
 * LOGIN_2FA=off in the environment always wins: it is the way back in if
 * email breaks while codes are on.
 */
export function codesForcedOff(): boolean {
  return process.env.LOGIN_2FA?.trim().toLowerCase() === "off";
}

export function loginCodeRequired(user: User): boolean {
  return !codesForcedOff() && user.login_codes;
}

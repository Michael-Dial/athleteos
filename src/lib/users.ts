import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { q, q1, seedQuestionnaires, tx } from "./db";
import { hashPassword } from "./vault";
import { forgetUserState } from "./user-session";

export type Role = "admin" | "member";

export interface User {
  id: number;
  athlete_id: number;
  email: string;
  role: Role;
  name: string;
  login_codes: boolean;
  has_password: boolean;
  disabled: boolean;
  session_epoch: number;
  trust_epoch: number;
}

export interface UserRow extends User {
  ow_user_id: string | null;
  created_at: string;
  last_login_at: string | null;
  /** Expiry of an unused invite or reset link, if one is outstanding. */
  link_expires_at: string | null;
}

const COLS = `u.id, u.athlete_id, u.email, u.role, a.name, u.login_codes, u.password_hash IS NOT NULL AS has_password,
  u.disabled_at IS NOT NULL AS disabled, u.session_epoch, u.trust_epoch`;

/** The invite/reset code shown to the admin after issuing it: an httpOnly cookie for two minutes, never a URL. */
export const LINK_FLASH_COOKIE = "aos_link";

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const INVITE_DAYS = 7;
export const RESET_HOURS = 24;

export async function userById(id: number): Promise<User | null> {
  return q1<User>(`SELECT ${COLS} FROM app_user u JOIN athlete a ON a.id = u.athlete_id WHERE u.id = $1`, [id]);
}

export async function userByEmail(email: string): Promise<(User & { password_hash: string | null }) | null> {
  return q1(`SELECT ${COLS}, u.password_hash FROM app_user u JOIN athlete a ON a.id = u.athlete_id WHERE lower(u.email) = lower($1)`, [email.trim()]);
}

export async function userByAthlete(athleteId: number): Promise<User | null> {
  return q1<User>(`SELECT ${COLS} FROM app_user u JOIN athlete a ON a.id = u.athlete_id WHERE u.athlete_id = $1`, [athleteId]);
}

export async function passwordHashOf(userId: number): Promise<string | null> {
  return (await q1<{ password_hash: string | null }>("SELECT password_hash FROM app_user WHERE id = $1", [userId]))?.password_hash ?? null;
}

export async function countUsers(): Promise<number> {
  return (await q1<{ n: number }>("SELECT count(*)::int AS n FROM app_user"))!.n;
}

export async function listUsers(): Promise<UserRow[]> {
  return q<UserRow>(
    `SELECT ${COLS}, a.ow_user_id, u.created_at, u.last_login_at,
       (SELECT max(l.expires_at) FROM user_link l WHERE l.user_id = u.id AND l.consumed_at IS NULL AND l.expires_at > now()) AS link_expires_at
     FROM app_user u JOIN athlete a ON a.id = u.athlete_id ORDER BY u.role, lower(a.name)`);
}

export class UserError extends Error {}

/** A new person: their own athlete (with the default questionnaires) and a user without a password yet. */
export async function createUser(name: string, email: string, role: Role): Promise<User> {
  const clean = email.trim();
  if (!EMAIL_RE.test(clean)) throw new UserError("Enter a valid email address.");
  const n = name.trim().slice(0, 80);
  if (!n) throw new UserError("Enter their name.");
  if (await userByEmail(clean)) throw new UserError("Someone already uses that email address.");
  const id = await tx(async (c) => {
    const a = (await c.query<{ id: number }>("INSERT INTO athlete (name) VALUES ($1) RETURNING id", [n])).rows[0].id;
    await seedQuestionnaires(c, a);
    return (await c.query<{ id: number }>("INSERT INTO app_user (athlete_id, email, role) VALUES ($1, $2, $3) RETURNING id", [a, clean, role])).rows[0].id;
  });
  return (await userById(id))!;
}

export async function setPassword(userId: number, pw: string): Promise<void> {
  await q("UPDATE app_user SET password_hash = $1 WHERE id = $2", [await hashPassword(pw), userId]);
}

export async function setEmail(userId: number, email: string): Promise<void> {
  const other = await userByEmail(email);
  if (other && other.id !== userId) throw new UserError("Someone already uses that email address.");
  await q("UPDATE app_user SET email = $1 WHERE id = $2", [email.trim(), userId]);
}

export async function setLoginCodes(userId: number, on: boolean): Promise<void> {
  await q("UPDATE app_user SET login_codes = $1 WHERE id = $2", [on, userId]);
}

export async function touchLogin(userId: number): Promise<void> {
  await q("UPDATE app_user SET last_login_at = now() WHERE id = $1", [userId]);
}

/** Ends every session of this user; returns the new epoch so the caller can keep its own browser signed in. */
export async function bumpSessionEpoch(userId: number): Promise<number> {
  const r = await q1<{ session_epoch: number }>("UPDATE app_user SET session_epoch = session_epoch + 1 WHERE id = $1 RETURNING session_epoch", [userId]);
  forgetUserState(userId);
  return r!.session_epoch;
}

export async function bumpTrustEpoch(userId: number): Promise<number> {
  return (await q1<{ trust_epoch: number }>("UPDATE app_user SET trust_epoch = trust_epoch + 1 WHERE id = $1 RETURNING trust_epoch", [userId]))!.trust_epoch;
}

async function activeAdmins(): Promise<number> {
  return (await q1<{ n: number }>("SELECT count(*)::int AS n FROM app_user WHERE role = 'admin' AND disabled_at IS NULL"))!.n;
}

/** Guard used by role changes, disabling and removal: an install always keeps one working admin. */
async function keepAnAdmin(target: User, change: string): Promise<void> {
  if (target.role === "admin" && !target.disabled && (await activeAdmins()) <= 1) {
    throw new UserError(`${target.name} is the only active admin, so they can't be ${change}. Make someone else an admin first.`);
  }
}

export async function setRole(target: User, role: Role): Promise<void> {
  if (role === target.role) return;
  if (role === "member") await keepAnAdmin(target, "made a member");
  await q("UPDATE app_user SET role = $1 WHERE id = $2", [role, target.id]);
  forgetUserState(target.id);
}

export async function setDisabled(target: User, disabled: boolean): Promise<void> {
  if (disabled) await keepAnAdmin(target, "disabled");
  await q("UPDATE app_user SET disabled_at = $1 WHERE id = $2", [disabled ? new Date() : null, target.id]);
  // Their open sessions stop at the next request; API tokens are checked per call.
  forgetUserState(target.id);
}

/** Removes the user and everything recorded for their athlete (plan, check-ins, settings, tokens). */
export async function deleteUser(target: User): Promise<void> {
  await keepAnAdmin(target, "removed");
  await q("DELETE FROM athlete WHERE id = $1", [target.athlete_id]);
  forgetUserState(target.id);
}

// ---------- invite codes (and the reset links that use the same mechanism) ----------

// Codes are typed by people, so they use Crockford base32 (no I, L, O, U) in
// three groups of four: 60 bits, single use, expiring, and the invite form is
// throttled per IP, so guessing one is out of reach.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_RE = /^[0-9A-HJKMNP-TV-Z]{12}$/;

/** Uppercase, drop spaces and dashes, and read the look-alike letters as the digits they resemble. */
export function normalizeCode(input: string): string | null {
  const c = input.toUpperCase().replace(/[\s-]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  return CODE_RE.test(c) ? c : null;
}

export function formatCode(c: string): string {
  return `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8, 12)}`;
}

function newCode(): string {
  const bytes = randomBytes(12);
  let out = "";
  // 256 is a multiple of 32, so taking each byte mod 32 is unbiased.
  for (const b of bytes) out += ALPHABET[b % 32];
  return out;
}

const hashCode = (c: string) => createHash("sha256").update(`invite:${c}`).digest("hex");

/** A one-time code that lets the user set a password; earlier unused codes for them stop working. */
export async function issueLink(userId: number, kind: "invite" | "reset"): Promise<{ code: string; expiresAt: Date }> {
  const code = newCode();
  const expiresAt = new Date(Date.now() + (kind === "invite" ? INVITE_DAYS * 86400_000 : RESET_HOURS * 3600_000));
  await tx(async (c) => {
    await c.query("UPDATE user_link SET consumed_at = now() WHERE user_id = $1 AND consumed_at IS NULL", [userId]);
    await c.query("INSERT INTO user_link (token_hash, user_id, kind, expires_at) VALUES ($1, $2, $3, $4)", [hashCode(code), userId, kind, expiresAt]);
  });
  return { code: formatCode(code), expiresAt };
}

export async function peekLink(input: string): Promise<{ user: User; kind: "invite" | "reset" } | null> {
  const code = normalizeCode(input);
  if (!code) return null;
  const row = await q1<{ user_id: number; kind: "invite" | "reset" }>(
    "SELECT user_id, kind FROM user_link WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > now()", [hashCode(code)]);
  if (!row) return null;
  const user = await userById(row.user_id);
  return user && !user.disabled ? { user, kind: row.kind } : null;
}

/** Set the password from a code. Single use; the user's other sessions end. */
export async function consumeLink(input: string, pw: string): Promise<User | null> {
  const link = await peekLink(input);
  const code = normalizeCode(input);
  if (!link || !code) return null;
  const used = await q1("UPDATE user_link SET consumed_at = now() WHERE token_hash = $1 AND consumed_at IS NULL RETURNING user_id", [hashCode(code)]);
  if (!used) return null;
  await setPassword(link.user.id, pw);
  await bumpSessionEpoch(link.user.id);
  return userById(link.user.id);
}

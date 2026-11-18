import "server-only";
import { q, q1 } from "./db";
import { maskEmail } from "./auth";
import { createRegistrationChallenge, verifyRegistrationChallenge } from "./login-challenge";
import { mailConfigured, sendAccountExists, sendRegistrationCode } from "./mail";
import { MIN_PASSWORD_LENGTH, needsFirstAdmin } from "./signin";
import { hashPassword } from "./vault";
import { EMAIL_RE, createUser, userByEmail, userById, type User } from "./users";

// Self sign-up. Anyone can create a member account while registration is open
// (the default); an admin can switch it to invite only in Settings → Users.
// The address is confirmed with an emailed code before the account exists, so
// nobody can hold an address they can't read, and the answer to "start" is the
// same whether or not the address already has an account: an existing owner
// gets an email saying so instead of a code.

export type RegistrationMode = "open" | "invite";

/** Sends per address and per network address in an hour; together they stop the form from mailing a stranger repeatedly. */
const PER_EMAIL_HOUR = 3;
const PER_IP_HOUR = 10;

export async function registrationMode(): Promise<RegistrationMode> {
  const row = await q1<{ value: { mode?: string } }>("SELECT value FROM system_kv WHERE key = 'registration'");
  return row?.value.mode === "invite" ? "invite" : "open";
}

export async function setRegistrationMode(mode: RegistrationMode): Promise<void> {
  await q(`INSERT INTO system_kv (key, value, updated_at) VALUES ('registration', $1, now())
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify({ mode })]);
}

export interface RegistrationStatus {
  mode: RegistrationMode;
  /** Sign-up can actually be used: open, and email works so the address can be confirmed. */
  available: boolean;
  /** Why it isn't, in words for the person on the sign-in screen. */
  reason: string | null;
}

export async function registrationStatus(): Promise<RegistrationStatus> {
  const [mode, mail, unclaimed] = await Promise.all([registrationMode(), mailConfigured(), needsFirstAdmin()]);
  // The first sign-in of a new install claims it as admin with the existing data; a stranger's sign-up must not get there first.
  if (unclaimed) return { mode, available: false, reason: "This server hasn't been set up yet. Its owner signs in first." };
  if (mode === "invite") return { mode, available: false, reason: "New accounts are by invite only on this server. Ask its admin for an invite code." };
  if (!mail) return { mode, available: false, reason: "Sign-up needs email to confirm your address, and email isn't set up on this server yet. Ask its admin." };
  return { mode, available: true, reason: null };
}

export class RegistrationError extends Error {
  constructor(readonly code: "closed" | "invalid_name" | "invalid_email" | "short_password" | "too_many" | "mail_failed" | "bad_code" | "code_expired" | "code_locked" | "unknown_challenge" | "taken", message: string) {
    super(message);
  }
}

export interface Pending {
  challengeId: string;
  /** Masked, so the screen can say where the code went without echoing a stranger's address back. */
  destination: string;
  expiresInSec: number;
}

/** Validate, then email a code (or, for an address that already has an account, a note saying so). */
export async function startRegistration(input: { name: string; email: string; password: string; device?: string }, ip: string): Promise<Pending> {
  const status = await registrationStatus();
  if (!status.available) throw new RegistrationError("closed", status.reason!);
  const name = input.name.trim().slice(0, 80);
  const email = input.email.trim();
  if (!name) throw new RegistrationError("invalid_name", "Enter your name.");
  if (!EMAIL_RE.test(email) || email.length > 254) throw new RegistrationError("invalid_email", "Enter a valid email address.");
  if (input.password.length < MIN_PASSWORD_LENGTH) throw new RegistrationError("short_password", `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`);

  const recent = await q1<{ email: number; ip: number }>(
    `SELECT count(*) FILTER (WHERE lower(meta->>'email') = lower($1))::int AS email, count(*) FILTER (WHERE ip = $2)::int AS ip
     FROM auth_challenge WHERE purpose = 'register' AND created_at > now() - interval '1 hour'`, [email, ip]);
  if ((recent?.email ?? 0) >= PER_EMAIL_HOUR || (recent?.ip ?? 0) >= PER_IP_HOUR) {
    throw new RegistrationError("too_many", "Too many sign-up attempts. Wait an hour, then try again.");
  }

  const existing = await userByEmail(email);
  // The pending account lives only in the challenge until the code is right; the hash is cleared once used.
  const meta: Record<string, string> = existing
    ? { email, existing: "1" }
    : { email, name, hash: await hashPassword(input.password), device: (input.device ?? "").trim().slice(0, 80) };
  const { id, code } = await createRegistrationChallenge(ip, meta);
  try {
    if (existing) await sendAccountExists(email, existing.name);
    else await sendRegistrationCode(email, code, name);
  } catch (e) {
    console.error("registration email failed:", e instanceof Error ? e.message : e);
    throw new RegistrationError("mail_failed", "The confirmation email couldn't be sent. Try again in a few minutes.");
  }
  return { challengeId: id, destination: maskEmail(email), expiresInSec: 600 };
}

const REASON: Record<"invalid" | "expired" | "locked" | "unknown", RegistrationError> = {
  invalid: new RegistrationError("bad_code", "That code isn't right. Check the email and try again."),
  expired: new RegistrationError("code_expired", "That code expired. Start again for a new one."),
  locked: new RegistrationError("code_locked", "Too many wrong codes. Start again for a new one."),
  unknown: new RegistrationError("unknown_challenge", "That sign-up has ended. Start again."),
};

/** The code was right: create the member account with the password chosen at the start. */
export async function finishRegistration(challengeId: string | undefined, code: string): Promise<{ user: User; device: string }> {
  const r = await verifyRegistrationChallenge(challengeId, code);
  if (!r.ok) throw REASON[r.reason];
  // The hash has done its job whatever happens next.
  await q("UPDATE auth_challenge SET meta = jsonb_build_object('email', meta->>'email') WHERE id = $1", [challengeId]);
  // An existing owner was never sent a code, so a right guess here is not a sign-up.
  if (r.meta.existing || !r.meta.hash) throw REASON.invalid;
  if (!(await registrationStatus()).available) throw new RegistrationError("closed", "Sign-up was closed while you were signing up. Ask the admin for an invite code.");
  if (await userByEmail(r.meta.email)) throw new RegistrationError("taken", "That address already has an account. Sign in, or use Forgot password.");
  const user = await createUser(r.meta.name, r.meta.email, "member");
  await q("UPDATE app_user SET password_hash = $1, last_login_at = now() WHERE id = $2", [r.meta.hash, user.id]);
  return { user: (await userById(user.id))!, device: r.meta.device || "App" };
}

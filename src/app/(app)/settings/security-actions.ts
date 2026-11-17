"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, TRUST_COOKIE, createSessionToken, createTrustToken } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { CREDENTIALS, credentialStates, cred, forgetCredentialCache, testSendsSavedSecretElsewhere, writeCredentials, type CredGroup, type CredName, type StoreName } from "@/lib/credentials";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { q } from "@/lib/db";
import { createChallenge, verifyChallenge } from "@/lib/login-challenge";
import { probeSmtp, sendLoginCode, sendMail, smtpConfig } from "@/lib/mail";
import { probeOw } from "@/lib/ow/client";
import { MIN_PASSWORD_LENGTH, confirmPassword } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { EMAIL_RE, UserError, bumpSessionEpoch, bumpTrustEpoch, setEmail, setLoginCodes, setPassword, userById, type User } from "@/lib/users";

// Credential and sign-in changes. Every change that could hand a secret to
// someone else (a new OW URL or SMTP host receives the stored key/password)
// or lock someone out asks for the current password, so a stolen session
// cookie alone can't redirect credentials or take over the account.

const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

function field(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

/** Null when the form's current password is right; otherwise what to tell the person. */
async function passwordProblem(user: User, fd: FormData): Promise<string | null> {
  const ip = clientIp(await headers());
  // Same limiter as sign-in, so this form can't be used to guess the password.
  if (isLocked(ip)) return "Too many wrong passwords. Wait 15 minutes, then try again.";
  if (!(await confirmPassword(user, String(fd.get("current_password") ?? "")))) {
    recordFailure(ip);
    return "Your current password didn't match, so nothing was changed.";
  }
  clearFailures(ip);
  return null;
}

async function requirePassword(user: User, fd: FormData, path: string): Promise<void> {
  const problem = await passwordProblem(user, fd);
  if (problem) fail(path, problem);
}

async function secureCookies(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto") === "https";
}

/** After the user's epoch moves, keep this browser signed in with a fresh cookie. */
async function reissueSession(user: User, epoch: number): Promise<void> {
  const { token, maxAge } = await createSessionToken(user.id, epoch);
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: await secureCookies(), path: "/", maxAge });
}

// ---------- credentials ----------

const EDITABLE: Record<"ow" | "smtp" | "push", CredName[]> = {
  ow: ["OW_API_BASE", "OW_API_KEY", "OW_EMAIL", "OW_PASSWORD"],
  smtp: ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"],
  push: ["VAPID_SUBJECT"],
};

function validate(name: CredName, v: string): string | null {
  switch (name) {
    case "OW_API_BASE":
      return /^https?:\/\/[^\s/]+/.test(v) ? null : "The API base URL must start with http:// or https://";
    case "SMTP_PORT":
      return /^\d{2,5}$/.test(v) && Number(v) <= 65535 ? null : "The SMTP port must be a number such as 587 or 465";
    case "OW_EMAIL":
      return v.includes("@") ? null : "The developer email doesn't look like an email address";
    case "VAPID_SUBJECT":
      return /^(mailto:|https:\/\/)\S+$/.test(v) ? null : "The push contact must be a mailto: or https:// URL";
    default:
      return v.length > 2000 ? `${CREDENTIALS[name].label} is too long` : null;
  }
}

type Changes = Partial<Record<StoreName, string | null>>;

/** What the form would change, or the first invalid value. */
async function formChanges(fd: FormData, names: CredName[]): Promise<{ changes: Changes } | { error: string }> {
  // Blank secret fields mean "keep what's saved": secrets are never sent to the browser to be re-submitted.
  const changes: Changes = {};
  for (const name of names) {
    if (fd.get(`clear:${name}`) === "on") { changes[name] = null; continue; }
    const v = field(fd, name);
    if (v === "") {
      // A cleared non-secret text box removes the app value (falling back to .env, if any).
      if (!CREDENTIALS[name].secret && fd.has(name)) changes[name] = null;
      continue;
    }
    // Unchanged values aren't written, so a value shown from .env stays an .env value.
    if (v === (await cred(name))) continue;
    const bad = validate(name, v);
    if (bad) return { error: bad };
    changes[name] = v;
  }
  return { changes };
}

/** A setting as it would be after saving `changes`. */
function afterSaving(changes: Changes) {
  return async (n: CredName): Promise<string | undefined> =>
    n in changes ? (changes[n] ?? (process.env[n]?.trim() || undefined)) : await cred(n);
}

/**
 * Try the settings with one signed-in request (OW) or a login without sending
 * (SMTP). `incomplete` when there is not enough to try yet.
 */
async function probeGroup(group: "ow" | "smtp", changes: Changes): Promise<{ incomplete: true } | { error: string | null }> {
  const after = afterSaving(changes);
  if (group === "ow") {
    const [base, apiKey, email, password] = await Promise.all([after("OW_API_BASE"), after("OW_API_KEY"), after("OW_EMAIL"), after("OW_PASSWORD")]);
    if (!base || !(apiKey || (email && password))) return { incomplete: true };
    return { error: await probeOw({ base: base.replace(/\/+$/, ""), apiKey, email, password }) };
  }
  const [host, port, user, pass, from] = await Promise.all(EDITABLE.smtp.map(after));
  if (!host || !from) return { incomplete: true };
  return { error: await probeSmtp({ host, port: Number(port || 587), user, pass, from }) };
}

export type CredentialTest = { ok: boolean; message: string };

/** Settings → Credentials "Test": tries what is in the form and saves nothing. */
export async function testCredentials(fd: FormData): Promise<CredentialTest> {
  const admin = await requireAdmin();
  const group = field(fd, "group");
  if (group !== "ow" && group !== "smtp") return { ok: false, message: "This group has nothing to test." };
  const parsed = await formChanges(fd, EDITABLE[group]);
  if ("error" in parsed) return { ok: false, message: parsed.error };
  const { changes } = parsed;

  // A secret counts as typed only when the form holds it; one removed here
  // falls back to .env, which is a stored secret like any saved one.
  const typed = (n: CredName) => typeof changes[n as StoreName] === "string";
  const changed = new Set((Object.keys(changes) as CredName[]).filter((n) => !CREDENTIALS[n].secret || typed(n)));
  const after = afterSaving(changes);
  const secrets = EDITABLE[group].filter((n) => CREDENTIALS[n].secret && !typed(n));
  const inUse = await Promise.all(secrets.map((n) => after(n)));
  const saved = new Set(secrets.filter((_, i) => inUse[i]));
  if (testSendsSavedSecretElsewhere(changed, saved)) {
    if (!field(fd, "current_password")) {
      return { ok: false, message: "This would send a saved key or password to a new address. Enter your AthleteOS password to test it." };
    }
    const problem = await passwordProblem(admin, fd);
    if (problem) return { ok: false, message: problem.replace(", so nothing was changed", ", so nothing was tested") };
  }

  const r = await probeGroup(group, changes);
  if ("incomplete" in r) {
    return { ok: false, message: group === "ow" ? "Enter the API base URL and an API key or a developer login first." : "Enter at least the host and the From address first." };
  }
  if (r.error) return { ok: false, message: `${group === "ow" ? "Open Wearables" : "The mail server"} rejected these settings. ${r.error}` };
  return { ok: true, message: group === "ow" ? "Open Wearables accepted these settings. Nothing was saved." : "The mail server accepted the login. Nothing was sent or saved." };
}

export async function saveCredentials(fd: FormData) {
  const admin = await requireAdmin();
  const group = field(fd, "group") as CredGroup;
  const path = "/settings/credentials";
  if (!(group in EDITABLE)) fail(path, "Unknown credential group");
  await requirePassword(admin, fd, path);
  const parsed = await formChanges(fd, EDITABLE[group as keyof typeof EDITABLE]);
  if ("error" in parsed) fail(path, parsed.error);
  const { changes } = parsed as { changes: Changes };

  // Try the settings as they would be after saving, before saving them.
  if (fd.get("skip_test") !== "on" && (group === "ow" || group === "smtp")) {
    const r = await probeGroup(group, changes);
    if ("error" in r && r.error) {
      fail(path, `Not saved: ${group === "ow" ? "Open Wearables" : "the mail server"} rejected these settings. ${r.error}`);
    }
  }

  await writeCredentials(changes);
  // Cached OW responses may have come from a different server or account.
  if (group === "ow") invalidate("ow:");
  redirect(`${path}?saved=${group}`);
}

export async function discardUnreadable() {
  await requireAdmin();
  const { unreadable } = await credentialStates();
  if (unreadable.length) await q("DELETE FROM credential WHERE name = ANY($1)", [unreadable]);
  forgetCredentialCache();
  redirect("/settings/credentials?discarded=1");
}

// ---------- password and sessions (each user, their own account) ----------

export async function changePassword(fd: FormData) {
  const user = await requireUser();
  const path = "/settings/security";
  await requirePassword(user, fd, path);
  const next = String(fd.get("new_password") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) fail(path, `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
  if (next !== String(fd.get("confirm_password") ?? "")) fail(path, "The new password and its confirmation don't match.");
  await setPassword(user.id, next);
  // Anyone holding an old session or trusted-device cookie for this account has to start over.
  await bumpTrustEpoch(user.id);
  await reissueSession(user, await bumpSessionEpoch(user.id));
  redirect(`${path}?password=1`);
}

export async function signOutOtherDevices() {
  const user = await requireUser();
  await reissueSession(user, await bumpSessionEpoch(user.id));
  redirect("/settings/security?signedout=1");
}

export async function forgetAllDevices() {
  const user = await requireUser();
  await bumpTrustEpoch(user.id);
  redirect("/settings/security?forgot=1");
}

// ---------- emailed sign-in codes and the account's address ----------

/**
 * Both switching codes on and changing the address send a confirmation code
 * to the address that will receive sign-in codes, so a typo or a dead inbox
 * can't lock the account.
 */
export async function startEmailConfirm(fd: FormData) {
  const user = await requireUser();
  const path = "/settings/security";
  await requirePassword(user, fd, path);
  const action = field(fd, "action") === "email" ? "email" : "codes";
  const to = action === "email" ? field(fd, "email") : user.email;
  if (!EMAIL_RE.test(to)) fail(path, "Enter a valid email address.");
  if (action === "email" && to.toLowerCase() === user.email.toLowerCase()) fail(path, "That's already your address.");
  if (!(await smtpConfig())) fail(path, "Email isn't set up on this server yet, so no code can be sent. Ask your admin.");
  const ip = clientIp(await headers());
  const { id, code } = await createChallenge("setup", user.id, ip, { action, email: to });
  try {
    await sendLoginCode(code, { ip, purpose: "setup", to });
  } catch (e) {
    fail(path, `The confirmation code couldn't be emailed: ${e instanceof Error ? e.message : String(e)}`);
  }
  redirect(`${path}?confirm=${id}`);
}

export async function confirmEmailCode(fd: FormData) {
  const user = await requireUser();
  const path = "/settings/security";
  const id = field(fd, "challenge");
  const r = await verifyChallenge(id, field(fd, "code"), "setup");
  if (!r.ok) {
    if (r.reason === "invalid") fail(`${path}?confirm=${id}`, "That code isn't right. Check the latest email.");
    fail(path, "That confirmation expired or was used up. Start again.");
  }
  if (!r.ok || r.challenge.userId !== user.id) return fail(path, "That confirmation belongs to another account.");
  if (r.challenge.meta.action === "email") {
    try {
      await setEmail(user.id, r.challenge.meta.email);
    } catch (e) {
      fail(path, e instanceof UserError ? e.message : String(e));
    }
    redirect(`${path}?email=1`);
  }
  await setLoginCodes(user.id, true);
  // They just proved they can read that inbox, so this browser starts out trusted.
  const fresh = (await userById(user.id))!;
  const { token, maxAge } = await createTrustToken(fresh.id, fresh.trust_epoch);
  (await cookies()).set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: await secureCookies(), path: "/", maxAge });
  redirect(`${path}?codes=on`);
}

export async function turnOffEmailCodes(fd: FormData) {
  const user = await requireUser();
  const path = "/settings/security";
  await requirePassword(user, fd, path);
  await setLoginCodes(user.id, false);
  redirect(`${path}?codes=off`);
}

export async function sendTestEmail(fd: FormData) {
  const admin = await requireAdmin();
  const path = "/settings/credentials";
  const to = field(fd, "to") || admin.email;
  try {
    await sendMail(to, "AthleteOS test email", "Email from AthleteOS is working. Sign-in codes and invites will arrive like this.",
      "<p style=\"font-family:system-ui,sans-serif\">Email from AthleteOS is working. Sign-in codes and invites will arrive like this.</p>");
  } catch (e) {
    fail(path, `Sending failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  redirect(`${path}?sent=1`);
}

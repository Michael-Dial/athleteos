"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, TRUST_COOKIE, createSessionToken, createTrustToken } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { CREDENTIALS, credentialStates, cred, forgetCredentialCache, writeCredentials, type CredGroup, type CredName, type StoreName } from "@/lib/credentials";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { deleteOwnAccount } from "@/lib/account-deletion";
import { errorMessage } from "@/lib/domain/errors";
import { VIEW_COOKIE } from "@/lib/domain/context";
import { q } from "@/lib/db";
import { createChallenge, verifyChallenge } from "@/lib/login-challenge";
import { probeSmtp, sendLoginCode, sendMail, smtpConfig } from "@/lib/mail";
import { owConfig, probeOw } from "@/lib/ow/client";
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

async function requirePassword(user: User, fd: FormData, path: string): Promise<void> {
  const ip = clientIp(await headers());
  // Same limiter as sign-in, so this form can't be used to guess the password.
  if (isLocked(ip)) fail(path, "Too many wrong passwords. Wait 15 minutes, then try again.");
  if (!(await confirmPassword(user, String(fd.get("current_password") ?? "")))) {
    recordFailure(ip);
    fail(path, "Your current password didn't match, so nothing was changed.");
  }
  clearFailures(ip);
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

export async function saveCredentials(fd: FormData) {
  const admin = await requireAdmin();
  const group = field(fd, "group") as CredGroup;
  const path = "/settings/credentials";
  if (!(group in EDITABLE)) fail(path, "Unknown credential group");
  await requirePassword(admin, fd, path);
  const names = EDITABLE[group as keyof typeof EDITABLE];

  // Blank secret fields mean "keep what's saved": secrets are never sent to the browser to be re-submitted.
  const changes: Partial<Record<StoreName, string | null>> = {};
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
    if (bad) fail(path, bad);
    changes[name] = v;
  }

  // Resolve what the settings would be after saving, then try them first.
  const after = async (n: CredName): Promise<string | undefined> =>
    n in changes ? (changes[n] ?? (process.env[n]?.trim() || undefined)) : await cred(n);
  if (fd.get("skip_test") !== "on") {
    if (group === "ow") {
      const [base, apiKey, email, password] = await Promise.all([after("OW_API_BASE"), after("OW_API_KEY"), after("OW_EMAIL"), after("OW_PASSWORD")]);
      if (base && (apiKey || (email && password))) {
        const err = await probeOw({ base: base.replace(/\/+$/, ""), apiKey, email, password });
        if (err) fail(path, `Not saved: Open Wearables rejected these settings. ${err}`);
      }
    } else if (group === "smtp") {
      const [host, port, user, pass, from] = await Promise.all(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"].map((n) => after(n as CredName)));
      if (host && from) {
        const err = await probeSmtp({ host, port: Number(port || 587), user, pass, from });
        if (err) fail(path, `Not saved: the mail server rejected these settings. ${err}`);
      }
    }
  }

  await writeCredentials(changes);
  // Cached OW responses may have come from a different server or account.
  if (group === "ow") invalidate("ow:");
  redirect(`${path}?saved=${group}`);
}

export interface ConnectionTest {
  ok: boolean | null;
  message: string;
  /** ISO time of the test, so the result can say when it was run. */
  at: string | null;
}

/**
 * Test the settings already in effect. Unlike saving, this takes nothing from
 * the form but which service to test, so the stored key or password can only
 * go to the host it is already configured for, and no password is needed.
 */
export async function testConnection(_prev: ConnectionTest, fd: FormData): Promise<ConnectionTest> {
  await requireAdmin();
  const group = field(fd, "group");
  const at = new Date().toISOString();
  const started = Date.now();
  const took = () => `${Date.now() - started} ms`;
  if (group === "ow") {
    const c = await owConfig();
    if (!c) return { ok: false, message: "Not set up: add the API base URL and an API key or a developer login, then save.", at };
    const err = await probeOw(c);
    if (err) return { ok: false, message: err, at };
    const how = c.apiKey && c.email && c.password ? "API key and developer login" : c.apiKey ? "API key" : "developer login";
    return { ok: true, message: `Connected to ${c.base} with the ${how} (${took()}).`, at };
  }
  if (group === "smtp") {
    const c = await smtpConfig();
    if (!c) return { ok: false, message: "Not set up: add an SMTP host and From address, then save.", at };
    const err = await probeSmtp(c);
    if (err) return { ok: false, message: `${c.host}:${c.port}: ${err}`, at };
    return { ok: true, message: `Connected to ${c.host}:${c.port}${c.user ? " and logged in" : ""} (${took()}). Nothing was sent.`, at };
  }
  return { ok: false, message: "Unknown service", at };
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

// ---------- deleting your own account ----------

/** Delete the signed-in user's account and data, after their password and their typed address. */
export async function deleteMyAccount(fd: FormData) {
  const path = "/settings/security";
  const user = await requireUser();
  if (field(fd, "confirm_email").toLowerCase() !== user.email.toLowerCase()) fail(path, `Type ${user.email} to confirm deleting your account.`);
  await requirePassword(user, fd, path);
  try {
    await deleteOwnAccount(user);
  } catch (e) {
    fail(path, e instanceof UserError ? e.message : `Nothing was deleted: ${errorMessage(e)} Try again in a few minutes.`);
  }
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
  jar.delete(VIEW_COOKIE);
  redirect("/login?deleted=1");
}

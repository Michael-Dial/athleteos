"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, TRUST_COOKIE, createSessionToken, createTrustToken } from "@/lib/auth";
import { invalidate } from "@/lib/cache";
import { CREDENTIALS, credentialStates, cred, forgetCredentialCache, writeCredentials, type CredGroup, type CredName, type StoreName } from "@/lib/credentials";
import { q } from "@/lib/db";
import { createChallenge, forgetTrustedDevices, trustEpoch, verifyChallenge } from "@/lib/login-challenge";
import { loginEmail, probeSmtp, sendLoginCode, sendMail, smtpConfig } from "@/lib/mail";
import { probeOw } from "@/lib/ow/client";
import { bumpSessionEpoch } from "@/lib/session-epoch";
import { MIN_PASSWORD_LENGTH, checkPassword, setPassword } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

// Credential and sign-in changes. Every change that could hand a secret to
// someone else (a new OW URL or SMTP host receives the stored key/password)
// or lock you out asks for the current password, so a stolen session cookie
// alone can't redirect credentials.

const fail = (path: string, msg: string): never => redirect(`${path}${path.includes("?") ? "&" : "?"}error=${encodeURIComponent(msg)}`);

function field(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

async function requirePassword(fd: FormData, path: string): Promise<void> {
  const ip = clientIp(await headers());
  // Same limiter as sign-in, so this form can't be used to guess the password.
  if (isLocked(ip)) fail(path, "Too many wrong passwords. Wait 15 minutes, then try again.");
  if (!(await checkPassword(String(fd.get("current_password") ?? "")))) {
    recordFailure(ip);
    fail(path, "Your current password didn't match, so nothing was changed.");
  }
  clearFailures(ip);
}

async function secureCookies(): Promise<boolean> {
  return (await headers()).get("x-forwarded-proto") === "https";
}

/** After the epoch moves, keep this browser signed in with a fresh cookie. */
async function reissueSession(epoch: number): Promise<void> {
  const { token, maxAge } = await createSessionToken(epoch);
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
  const group = field(fd, "group") as CredGroup;
  const path = "/settings/credentials";
  if (!(group in EDITABLE)) fail(path, "Unknown credential group");
  await requirePassword(fd, path);
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

export async function discardUnreadable() {
  const { unreadable } = await credentialStates();
  if (unreadable.length) await q("DELETE FROM credential WHERE name = ANY($1)", [unreadable]);
  forgetCredentialCache();
  redirect("/settings/credentials?discarded=1");
}

// ---------- password and sessions ----------

export async function changePassword(fd: FormData) {
  const path = "/settings/security";
  await requirePassword(fd, path);
  const next = String(fd.get("new_password") ?? "");
  if (next.length < MIN_PASSWORD_LENGTH) fail(path, `Use at least ${MIN_PASSWORD_LENGTH} characters for the new password.`);
  if (next !== String(fd.get("confirm_password") ?? "")) fail(path, "The new password and its confirmation don't match.");
  await setPassword(next);
  // Anyone holding an old session or trusted-device cookie has to start over.
  await forgetTrustedDevices();
  await reissueSession(await bumpSessionEpoch());
  redirect(`${path}?password=1`);
}

export async function signOutOtherDevices() {
  await reissueSession(await bumpSessionEpoch());
  redirect("/settings/security?signedout=1");
}

export async function forgetAllDevices() {
  await forgetTrustedDevices();
  redirect("/settings/security?forgot=1");
}

// ---------- emailed sign-in codes ----------

export async function startEmailCodes(fd: FormData) {
  const path = "/settings/security";
  await requirePassword(fd, path);
  const to = field(fd, "email");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) fail(path, "Enter the address the codes should go to.");
  if (!(await smtpConfig())) fail(path, "Set up email in Settings → Credentials first.");
  const ip = clientIp(await headers());
  const { id, code } = await createChallenge("setup", ip, { email: to });
  try {
    await sendLoginCode(code, { ip, purpose: "setup", to });
  } catch (e) {
    fail(path, `The confirmation code couldn't be emailed: ${e instanceof Error ? e.message : String(e)}`);
  }
  redirect(`${path}?confirm=${id}`);
}

export async function confirmEmailCodes(fd: FormData) {
  const path = "/settings/security";
  const id = field(fd, "challenge");
  const r = await verifyChallenge(id, field(fd, "code"), "setup");
  if (!r.ok) {
    if (r.reason === "invalid") fail(`${path}?confirm=${id}`, "That code isn't right. Check the latest email.");
    fail(path, "That confirmation expired or was used up. Start again.");
  }
  if (!r.ok) return;
  await writeCredentials({ LOGIN_EMAIL: r.challenge.meta.email, LOGIN_2FA: "email" });
  // You just proved you can read that inbox, so this browser starts out trusted.
  const { token, maxAge } = await createTrustToken(await trustEpoch());
  (await cookies()).set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: await secureCookies(), path: "/", maxAge });
  redirect(`${path}?codes=on`);
}

export async function turnOffEmailCodes(fd: FormData) {
  const path = "/settings/security";
  await requirePassword(fd, path);
  // Stored as "off" (not deleted) so it also overrides LOGIN_2FA=email in .env.
  await writeCredentials({ LOGIN_2FA: "off" });
  redirect(`${path}?codes=off`);
}

export async function sendTestEmail(fd: FormData) {
  const path = field(fd, "back") === "credentials" ? "/settings/credentials" : "/settings/security";
  const to = field(fd, "to") || (await loginEmail());
  if (!to) fail(path, "Enter an address to send the test to.");
  try {
    await sendMail(to!, "AthleteOS test email", "Email from AthleteOS is working. Sign-in codes will arrive like this.",
      "<p style=\"font-family:system-ui,sans-serif\">Email from AthleteOS is working. Sign-in codes will arrive like this.</p>");
  } catch (e) {
    fail(path, `Sending failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  redirect(`${path}?sent=1`);
}

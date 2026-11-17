import "server-only";
import nodemailer from "nodemailer";
import { cred } from "./credentials";

// Outbound mail over plain SMTP, so any provider works (Brevo, Gmail/Workspace
// with an app password, Fastmail, iCloud, a relay). Settings come from
// Settings → Credentials, falling back to the environment.

export interface SmtpConfig {
  host: string;
  port: number;
  user?: string;
  pass?: string;
  from: string;
}

export async function smtpConfig(): Promise<SmtpConfig | null> {
  const [host, port, user, pass, from] = await Promise.all([cred("SMTP_HOST"), cred("SMTP_PORT"), cred("SMTP_USER"), cred("SMTP_PASS"), cred("SMTP_FROM")]);
  if (!host || !from) return null;
  return { host, port: Number(port || 587), user, pass, from };
}

/** Email can be sent (sign-in codes, invites). */
export async function mailConfigured(): Promise<boolean> {
  return (await smtpConfig()) !== null;
}

function transport(c: SmtpConfig) {
  return nodemailer.createTransport({
    host: c.host,
    port: c.port,
    // 465 is implicit TLS; 587/25 upgrade with STARTTLS, which is required unless explicitly allowed off.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : c.port === 465,
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false" && c.port !== 465,
    auth: c.user ? { user: c.user, pass: c.pass ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

/** Connect and authenticate without sending anything; null when it works. */
export async function probeSmtp(c: SmtpConfig): Promise<string | null> {
  try {
    await transport(c).verify();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  const c = await smtpConfig();
  if (!c) throw new Error("Email isn't set up: add an SMTP host and From address in Settings → Credentials");
  await transport(c).sendMail({ from: c.from, to, subject, text, html });
}

// The device name comes from the API caller, so it is escaped before it goes into HTML.
function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

type CodePurpose = "web" | "token" | "setup";

export async function sendLoginCode(code: string, ctx: { ip: string; purpose: CodePurpose; device?: string; to: string }): Promise<void> {
  const to = ctx.to;
  const when = new Date().toUTCString();
  if (ctx.purpose === "setup") {
    const text = [
      `Your AthleteOS confirmation code is ${code}`,
      "",
      `Enter it in Settings → Security to confirm this address. Requested from ${ctx.ip} at ${when}; it expires in 10 minutes.`,
    ].join("\n");
    const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
<p>Your AthleteOS confirmation code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p style="color:#555">Enter it in Settings → Security to confirm this address. Requested from ${esc(ctx.ip)} at ${when}; it expires in 10 minutes.</p>
</div>`;
    await sendMail(to, "Confirm your AthleteOS email address", text, html);
    return;
  }
  const what = ctx.purpose === "token" ? `an app sign-in${ctx.device ? ` (“${ctx.device}”)` : ""}` : "a sign-in";
  const text = [
    `Your AthleteOS code is ${code}`,
    "",
    `It was requested for ${what} from ${ctx.ip} at ${when} and expires in 10 minutes.`,
    "If this wasn't you, someone has your AthleteOS password: change it in Settings → Security.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
<p>Your AthleteOS code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p style="color:#555">Requested for ${esc(what)} from ${esc(ctx.ip)} at ${when}. It expires in 10 minutes.</p>
<p style="color:#555">If this wasn't you, someone has your AthleteOS password: change it in Settings → Security.</p>
</div>`;
  await sendMail(to, "Your AthleteOS sign-in code", text, html);
}

/** An invite or password-reset link. The link itself is the secret, so it goes only to the user's address. */
export async function sendAccountLink(to: string, ctx: { kind: "invite" | "reset"; url: string; name: string; by: string; expires: string }): Promise<void> {
  const invite = ctx.kind === "invite";
  const subject = invite ? "You're invited to AthleteOS" : "Set a new AthleteOS password";
  const lead = invite ? `${ctx.by} invited you to AthleteOS.` : `${ctx.by} sent you a link to set a new AthleteOS password.`;
  const text = [`Hi ${ctx.name},`, "", lead, "", `Set your password here: ${ctx.url}`, "", `The link works once and expires ${ctx.expires}.`].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
<p>Hi ${esc(ctx.name)},</p>
<p>${esc(lead)}</p>
<p><a href="${esc(ctx.url)}" style="display:inline-block;background:#c8f046;color:#0c0d0f;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">Set your password</a></p>
<p style="color:#555">The link works once and expires ${esc(ctx.expires)}.</p>
</div>`;
  await sendMail(to, subject, text, html);
}

import "server-only";
import nodemailer from "nodemailer";

// Outbound mail over plain SMTP, so any provider works (Gmail/Workspace with
// an app password, Fastmail, iCloud, a relay). Nothing is sent unless the
// SMTP settings are present.

export function loginEmail(): string | null {
  return process.env.LOGIN_EMAIL?.trim() || null;
}

export function mailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM && loginEmail());
}

function transport() {
  const port = Number(process.env.SMTP_PORT || 587);
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    // 465 is implicit TLS; 587/25 upgrade with STARTTLS, which is required unless explicitly allowed off.
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === "true" : port === 465,
    requireTLS: process.env.SMTP_REQUIRE_TLS !== "false" && port !== 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 20_000,
  });
}

export async function sendMail(to: string, subject: string, text: string, html: string): Promise<void> {
  await transport().sendMail({ from: process.env.SMTP_FROM, to, subject, text, html });
}

export async function sendLoginCode(code: string, ctx: { ip: string; purpose: "web" | "token"; device?: string }): Promise<void> {
  const to = loginEmail();
  if (!to) throw new Error("LOGIN_EMAIL is not set");
  const what = ctx.purpose === "token" ? `an app sign-in${ctx.device ? ` (“${ctx.device}”)` : ""}` : "a sign-in";
  const when = new Date().toUTCString();
  const text = [
    `Your AthleteOS code is ${code}`,
    "",
    `It was requested for ${what} from ${ctx.ip} at ${when} and expires in 10 minutes.`,
    "If this wasn't you, someone has your AthleteOS password: change ATHLETEOS_PASSWORD on the server.",
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;color:#111">
<p>Your AthleteOS code is</p>
<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p style="color:#555">Requested for ${what} from ${ctx.ip} at ${when}. It expires in 10 minutes.</p>
<p style="color:#555">If this wasn't you, someone has your AthleteOS password: change <code>ATHLETEOS_PASSWORD</code> on the server.</p>
</div>`;
  await sendMail(to, "Your AthleteOS sign-in code", text, html);
}

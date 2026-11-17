import type { Metadata } from "next";
import Link from "next/link";
import { TRUST_DAYS, maskEmail } from "@/lib/auth";
import { loginEmail, smtpConfig } from "@/lib/mail";
import { MIN_PASSWORD_LENGTH, codesForcedOff, loginCodeRequired, passwordSource } from "@/lib/signin";
import { Card, Notice, StatePill } from "@/components/ui";
import {
  changePassword, confirmEmailCodes, forgetAllDevices, sendTestEmail, signOutOtherDevices, startEmailCodes, turnOffEmailCodes,
} from "../security-actions";

export const metadata: Metadata = { title: "Security" };

const DONE: Record<string, string> = {
  password: "Password changed. Every other browser, phone and trusted device is signed out.",
  signedout: "Every other browser and phone is signed out. This one stays signed in.",
  forgot: "Every trusted device will need a code at its next sign-in.",
  sent: "Test email sent. Check the inbox (and spam).",
  on: "Emailed codes are on. This browser is trusted for 30 days.",
  off: "Emailed codes are off. Sign-in needs only the password.",
};

function PasswordField({ label = "Your current password", name = "current_password", auto = "current-password" }: { label?: string; name?: string; auto?: string }) {
  return <label className="field">{label}<input name={name} type="password" autoComplete={auto} required minLength={name === "current_password" ? undefined : MIN_PASSWORD_LENGTH} /></label>;
}

type SP = { error?: string; password?: string; signedout?: string; forgot?: string; sent?: string; codes?: string; confirm?: string };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [pwSource, on, smtp, to] = await Promise.all([passwordSource(), loginCodeRequired(), smtpConfig(), loginEmail()]);
  const forcedOff = codesForcedOff();
  const done = sp.password ? DONE.password : sp.signedout ? DONE.signedout : sp.forgot ? DONE.forgot : sp.sent ? DONE.sent : sp.codes ? DONE[sp.codes] : null;
  const confirming = sp.confirm && /^[0-9a-f-]{36}$/i.test(sp.confirm) ? sp.confirm : null;
  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {done && <p className="small" style={{ color: "var(--good)" }} role="status">{done}</p>}
      <div className="grid cols-2">
        <Card title="Password" action={<StatePill state="ok" label={pwSource === "app" ? "Set here" : "From .env"} />}>
          <form action={changePassword} className="stack">
            <PasswordField />
            <PasswordField label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`} name="new_password" auto="new-password" />
            <PasswordField label="New password again" name="confirm_password" auto="new-password" />
            <p className="small muted">
              {pwSource === "app"
                ? "Stored as a scrypt hash. ATHLETEOS_PASSWORD in .env is ignored while a password is set here."
                : "Setting one here replaces ATHLETEOS_PASSWORD from .env. Only a scrypt hash is kept."}{" "}
              Changing it signs out every other device. API tokens keep working; revoke them under <Link href="/settings/api">API tokens</Link>.
            </p>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">Change password</button></div>
          </form>
        </Card>

        <Card title="Emailed sign-in codes" action={<StatePill state={on ? "ok" : "nodata"} label={on ? "On" : "Off"} />}>
          <div className="stack">
            <p className="small ink2">
              Sign-in needs your password plus a 6-digit code sent by email. Codes expire after 10 minutes and allow 5 tries. Devices you trust skip the code for {TRUST_DAYS} days. Native-app sign-in asks for a code too.
            </p>
            {forcedOff && <Notice>LOGIN_2FA=off is set in the server environment, which keeps codes off whatever is chosen here. Remove it once email works.</Notice>}
            {!smtp && !on && <Notice kind="info">Set up email in <Link href="/settings/credentials">Credentials</Link> first.</Notice>}
            {on && to && <p className="small">Codes go to <b>{maskEmail(to)}</b>.</p>}

            {confirming ? (
              <form action={confirmEmailCodes} className="stack">
                <input type="hidden" name="challenge" value={confirming} />
                <label className="field">Confirmation code from the email
                  <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
                    style={{ fontFamily: "var(--display)", fontSize: 24, letterSpacing: "0.3em", textAlign: "center" }} />
                </label>
                <div className="row between">
                  <Link className="small" href="/settings/security">Cancel</Link>
                  <button className="btn primary" type="submit">{on ? "Use this address" : "Turn on codes"}</button>
                </div>
              </form>
            ) : smtp && !forcedOff ? (
              <form action={startEmailCodes} className="stack">
                <label className="field">{on ? "Send codes to a different address" : "Send codes to"}
                  <input name="email" type="email" autoComplete="email" required defaultValue={on ? "" : to ?? ""} />
                </label>
                <PasswordField />
                <p className="small muted">A confirmation code goes to this address first, so a typo can&apos;t lock you out.</p>
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" type="submit">Send confirmation code</button></div>
              </form>
            ) : null}

            {on && !confirming && (
              <form action={turnOffEmailCodes} className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                <PasswordField />
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn danger" type="submit">Turn off codes</button></div>
              </form>
            )}
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Signed-in devices">
          <div className="stack">
            <p className="small ink2">Ends every session except this one: other browsers, phones and installed apps using a web sign-in must sign in again.</p>
            <form action={signOutOtherDevices}><button className="btn danger" type="submit">Sign out other devices</button></form>
          </div>
        </Card>
        <Card title="Trusted devices">
          <div className="stack">
            <p className="small ink2">Lost a phone or signed in somewhere shared? Every trusted browser and phone will need a code again. Sessions already open stay signed in; use “Sign out other devices” to end them too.</p>
            <form action={forgetAllDevices}><button className="btn danger" type="submit">Forget all trusted devices</button></form>
          </div>
        </Card>
      </div>

      {smtp && (
        <Card title="Test email">
          <form action={sendTestEmail} className="row" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1, maxWidth: 420 }}>Send to<input name="to" type="email" autoComplete="email" placeholder={to ? maskEmail(to) : ""} required={!to} /></label>
            <button className="btn" type="submit">Send test email</button>
          </form>
        </Card>
      )}
    </div>
  );
}

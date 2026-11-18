import type { Metadata } from "next";
import Link from "next/link";
import { TRUST_DAYS, maskEmail } from "@/lib/auth";
import { actsAsAdmin, requireUser } from "@/lib/current-user";
import { smtpConfig } from "@/lib/mail";
import { MIN_PASSWORD_LENGTH, codesForcedOff } from "@/lib/signin";
import { Card, Notice, StatePill } from "@/components/ui";
import {
  changePassword, confirmEmailCode, deleteMyAccount, forgetAllDevices, signOutOtherDevices, startEmailConfirm, turnOffEmailCodes,
} from "../security-actions";

export const metadata: Metadata = { title: "Security" };

const DONE: Record<string, string> = {
  password: "Password changed. Every other browser, phone and trusted device is signed out.",
  signedout: "Every other browser and phone is signed out. This one stays signed in.",
  forgot: "Every trusted device will need a code at its next sign-in.",
  email: "Email address changed. Sign in with the new one from now on.",
  on: "Emailed codes are on. This browser is trusted for 30 days.",
  off: "Emailed codes are off. Sign-in needs only your password.",
};

function PasswordField({ label = "Your current password", name = "current_password", auto = "current-password" }: { label?: string; name?: string; auto?: string }) {
  return <label className="field">{label}<input name={name} type="password" autoComplete={auto} required minLength={name === "current_password" ? undefined : MIN_PASSWORD_LENGTH} /></label>;
}

type SP = { error?: string; password?: string; signedout?: string; forgot?: string; email?: string; codes?: string; confirm?: string };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [user, smtp, admin] = await Promise.all([requireUser(), smtpConfig(), actsAsAdmin()]);
  const forcedOff = codesForcedOff();
  const on = user.login_codes && !forcedOff;
  const done = sp.password ? DONE.password : sp.signedout ? DONE.signedout : sp.forgot ? DONE.forgot : sp.email ? DONE.email : sp.codes ? DONE[sp.codes] : null;
  const confirming = sp.confirm && /^[0-9a-f-]{36}$/i.test(sp.confirm) ? sp.confirm : null;
  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {done && <p className="small" style={{ color: "var(--good)" }} role="status">{done}</p>}

      {confirming && (
        <Card title="Enter the confirmation code">
          <form action={confirmEmailCode} className="stack" style={{ maxWidth: 420 }}>
            <input type="hidden" name="challenge" value={confirming} />
            <label className="field">Code from the email
              <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
                style={{ fontFamily: "var(--display)", fontSize: 24, letterSpacing: "0.3em", textAlign: "center" }} />
            </label>
            <div className="row between">
              <Link className="small" href="/settings/security">Cancel</Link>
              <button className="btn primary" type="submit">Confirm</button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid cols-2">
        <Card title="Password" action={user.has_password ? undefined : <StatePill state="flag" label="Not set" />}>
          <form action={changePassword} className="stack">
            <input type="email" name="username" autoComplete="username" value={user.email} readOnly hidden />
            <PasswordField />
            <PasswordField label={`New password (at least ${MIN_PASSWORD_LENGTH} characters)`} name="new_password" auto="new-password" />
            <PasswordField label="New password again" name="confirm_password" auto="new-password" />
            <p className="small muted">Changing it signs out every other device. API tokens keep working; revoke them under <Link href="/settings/api">API tokens</Link>.</p>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">Change password</button></div>
          </form>
        </Card>

        <Card title="Emailed sign-in codes" action={<StatePill state={on ? "ok" : "nodata"} label={on ? "On" : "Off"} />}>
          <div className="stack">
            <p className="small ink2">
              Sign-in needs your password plus a 6-digit code sent to <b>{maskEmail(user.email)}</b>. Codes expire after 10 minutes and allow 5 tries. Devices you trust skip the code for {TRUST_DAYS} days. App sign-in asks for a code too.
            </p>
            {forcedOff && <Notice>Codes are switched off for everyone on this server (LOGIN_2FA=off), whatever is chosen here.</Notice>}
            {!smtp && <Notice kind="info">Email isn&apos;t set up on this server yet, so codes can&apos;t be sent.{admin ? <> Set it up in <Link href="/settings/credentials">Credentials</Link>.</> : " Ask your admin."}</Notice>}
            {smtp && !forcedOff && !confirming && (on ? (
              <form action={turnOffEmailCodes} className="stack">
                <PasswordField />
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn danger" type="submit">Turn off codes</button></div>
              </form>
            ) : (
              <form action={startEmailConfirm} className="stack">
                <input type="hidden" name="action" value="codes" />
                <PasswordField />
                <p className="small muted">A confirmation code goes to your address first, so a dead inbox can&apos;t lock you out.</p>
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" type="submit">Send confirmation code</button></div>
              </form>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Email address">
          <div className="stack">
            <p className="small ink2">You sign in as <b>{user.email}</b>; codes, invites and password links go there.</p>
            {smtp ? !confirming && (
              <form action={startEmailConfirm} className="stack">
                <input type="hidden" name="action" value="email" />
                <label className="field">New address<input name="email" type="email" autoComplete="email" required /></label>
                <PasswordField />
                <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" type="submit">Send confirmation code</button></div>
              </form>
            ) : <p className="small muted">Changing it needs email, which isn&apos;t set up on this server yet.</p>}
          </div>
        </Card>
        <Card title="Devices">
          <div className="stack">
            <p className="small ink2">Sign out everywhere except this browser, or make every trusted device enter a code again.</p>
            <div className="row" style={{ flexWrap: "wrap" }}>
              <form action={signOutOtherDevices}><button className="btn danger" type="submit">Sign out other devices</button></form>
              <form action={forgetAllDevices}><button className="btn danger" type="submit">Forget trusted devices</button></form>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Delete account">
        <form action={deleteMyAccount} className="stack" style={{ maxWidth: 520 }}>
          <p className="small ink2">
            Deletes your sign-in, plan, check-ins, settings and the device data synced to AthleteOS, and disconnects your wearables from it. Your watch and ring makers keep their own copies. This can&apos;t be undone.
          </p>
          <label className="field">{`Type ${user.email} to confirm`}<input name="confirm_email" type="email" autoComplete="off" required /></label>
          <PasswordField />
          <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn danger" type="submit">Delete my account</button></div>
        </form>
      </Card>

      {!admin && (
        <p className="small muted">Admins of this AthleteOS can view your dashboards (read-only) and manage your account. They can&apos;t see your password.</p>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { TRUST_DAYS, loginCodeRequired, maskEmail } from "@/lib/auth";
import { loginEmail, mailConfigured } from "@/lib/mail";
import { Card, Notice, StatePill } from "@/components/ui";
import { forgetAllDevices, sendTestEmail } from "../../actions";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage({ searchParams }: { searchParams: Promise<{ sent?: string; forgot?: string; error?: string }> }) {
  const sp = await searchParams;
  const on = loginCodeRequired();
  const mail = mailConfigured();
  const to = loginEmail();
  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.sent && <p className="small" style={{ color: "var(--good)" }} role="status">Test email sent{to ? ` to ${maskEmail(to)}` : ""}. Check the inbox (and spam).</p>}
      {sp.forgot && <p className="small" style={{ color: "var(--good)" }} role="status">Every trusted device will need a code at its next sign-in.</p>}
      <div className="grid cols-2">
        <Card title="Sign-in codes" action={<StatePill state={on && mail ? "ok" : on ? "flag" : "nodata"} label={on && mail ? "On" : on ? "Misconfigured" : "Off"} />}>
          <div className="stack small ink2">
            <p>When on, signing in needs your password and a 6-digit code emailed to {to ? maskEmail(to) : "LOGIN_EMAIL"}. Codes expire after 10 minutes and allow 5 tries. Devices you trust skip the code for {TRUST_DAYS} days. Native-app sign-in asks for the code too.</p>
            {!on && <p>Turn on by setting <code className="mono">LOGIN_2FA=email</code> plus the SMTP settings in <code className="mono">.env</code>, then restart.</p>}
            {on && !mail && <p style={{ color: "var(--bad)" }}>Codes are on but email isn&apos;t set up, so sign-in will fail until SMTP_HOST, SMTP_FROM and LOGIN_EMAIL are set.</p>}
          </div>
        </Card>
        <Card title="Email">
          <div className="stack">
            <p className="small ink2">{mail ? `Sending through ${process.env.SMTP_HOST}:${process.env.SMTP_PORT || 587} as ${process.env.SMTP_FROM}.` : "Not configured."}</p>
            <form action={sendTestEmail}><button className="btn" type="submit" disabled={!mail}>Send a test email</button></form>
          </div>
        </Card>
      </div>
      <Card title="Trusted devices">
        <div className="row between">
          <p className="small ink2" style={{ maxWidth: 560 }}>Lost a phone or signed in somewhere shared? This makes every trusted browser and phone enter a code again. Current sessions stay signed in until they expire; sign out on that device, or change the password, to end them now.</p>
          <form action={forgetAllDevices}><button className="btn danger" type="submit">Forget all trusted devices</button></form>
        </div>
      </Card>
    </div>
  );
}

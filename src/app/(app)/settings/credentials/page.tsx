import type { Metadata } from "next";
import Link from "next/link";
import { credentialStates, type CredName, type CredState } from "@/lib/credentials";
import { owConfig } from "@/lib/ow/client";
import { smtpConfig } from "@/lib/mail";
import { Card, Notice, StatePill } from "@/components/ui";
import { discardUnreadable, saveCredentials, sendTestEmail } from "../security-actions";

export const metadata: Metadata = { title: "Credentials" };

const SAVED: Record<string, string> = {
  ow: "Open Wearables settings tested and saved.",
  smtp: "Email settings tested and saved.",
  push: "Push contact saved.",
};

function Source({ s }: { s: CredState }) {
  if (s.source === "app") return <span className="pill ok">Saved here</span>;
  if (s.source === "env") return <span className="pill nodata">From .env</span>;
  return <span className="pill nodata">Not set</span>;
}

function Field({ s }: { s: CredState }) {
  const d = s.def;
  return (
    <div className="stack" style={{ gap: 4 }}>
      <label className="field">
        <span className="row between">{d.label}<Source s={s} /></span>
        {d.secret ? (
          <input name={s.name} type="password" autoComplete="new-password" spellCheck={false}
            placeholder={s.masked ? `${s.masked} saved · leave blank to keep` : "Not set"} />
        ) : (
          <input name={s.name} type={d.type === "number" ? "text" : d.type ?? "text"} inputMode={d.type === "number" ? "numeric" : undefined}
            defaultValue={s.value ?? ""} placeholder={d.placeholder} spellCheck={false} autoComplete="off" />
        )}
        {d.hint && <span className="help">{d.hint}</span>}
      </label>
      {s.source === "app" && (
        <label className="row small ink2" style={{ gap: 6 }}>
          <input type="checkbox" name={`clear:${s.name}`} /> Remove the saved value{s.envFallback ? " (falls back to .env)" : ""}
        </label>
      )}
    </div>
  );
}

function SaveRow({ test }: { test: boolean }) {
  return (
    <div className="stack" style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <label className="field">
        Your AthleteOS password
        <input name="current_password" type="password" autoComplete="current-password" required />
        <span className="help">Needed for every credential change, so a stolen session can&apos;t send your keys elsewhere.</span>
      </label>
      <div className="row between">
        {test ? <label className="row small ink2" style={{ gap: 6 }}><input type="checkbox" name="skip_test" /> Save without testing</label> : <span />}
        <button className="btn primary" type="submit">{test ? "Test and save" : "Save"}</button>
      </div>
    </div>
  );
}

export default async function CredentialsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string; sent?: string; discarded?: string }> }) {
  const sp = await searchParams;
  const [{ states, unreadable }, ow, smtp] = await Promise.all([credentialStates(), owConfig(), smtpConfig()]);
  const fields = (names: CredName[]) => names.map((n) => <Field key={n} s={states[n]} />);
  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.saved && SAVED[sp.saved] && <p className="small" style={{ color: "var(--good)" }} role="status">{SAVED[sp.saved]}</p>}
      {sp.sent && <p className="small" style={{ color: "var(--good)" }} role="status">Test email sent. Check the inbox (and spam).</p>}
      {sp.discarded && <p className="small" style={{ color: "var(--good)" }} role="status">Unreadable values removed.</p>}
      {unreadable.length > 0 && (
        <Notice kind="bad">
          <div className="stack" style={{ gap: 6 }}>
            <span>{unreadable.length} saved value{unreadable.length > 1 ? "s" : ""} can&apos;t be read, most likely because SESSION_SECRET changed. Enter {unreadable.length > 1 ? "them" : "it"} again, or remove {unreadable.length > 1 ? "them" : "it"}.</span>
            <form action={discardUnreadable}><button className="btn sm" type="submit">Remove unreadable values</button></form>
          </div>
        </Notice>
      )}
      <p className="small ink2" style={{ maxWidth: 720 }}>
        Values saved here are encrypted in the database and take effect immediately, with no restart. They override the same setting in <code className="mono">.env</code>; remove one to fall back to <code className="mono">.env</code>. Secrets are never shown again after saving. The sign-in password and emailed codes are under <Link href="/settings/security">Security</Link>.
      </p>
      <div className="grid cols-2">
        <Card title="Open Wearables" action={<StatePill state={ow ? "ok" : "nodata"} label={ow ? (ow.apiKey ? "API key" : "Developer login") : "Not set up"} />}>
          <form action={saveCredentials} className="stack" id="ow">
            <input type="hidden" name="group" value="ow" />
            {fields(["OW_API_BASE", "OW_API_KEY", "OW_EMAIL", "OW_PASSWORD"])}
            <p className="small muted">Saving makes one signed-in request to Open Wearables first and refuses settings it rejects. Link your OW user and connect devices under <Link href="/settings/connections">Open Wearables</Link>.</p>
            <SaveRow test />
          </form>
        </Card>
        <Card title="Email (SMTP)" action={<StatePill state={smtp ? "ok" : "nodata"} label={smtp ? "Set up" : "Not set up"} />}>
          <form action={saveCredentials} className="stack" id="smtp">
            <input type="hidden" name="group" value="smtp" />
            {fields(["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"])}
            <p className="small muted">Used for sign-in codes. Saving connects and logs in to the mail server first, without sending anything. Brevo: host smtp-relay.brevo.com, port 587, your SMTP login and an SMTP key.</p>
            <SaveRow test />
          </form>
          <form action={sendTestEmail} className="row mt" style={{ alignItems: "flex-end", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <input type="hidden" name="back" value="credentials" />
            <label className="field" style={{ flex: 1 }}>Send a test to<input name="to" type="email" autoComplete="email" required /></label>
            <button className="btn" type="submit" disabled={!smtp}>Send test</button>
          </form>
        </Card>
      </div>
      <Card title="Push notifications">
        <form action={saveCredentials} className="stack" style={{ maxWidth: 520 }}>
          <input type="hidden" name="group" value="push" />
          {fields(["VAPID_SUBJECT"])}
          <p className="small muted">The push keys themselves are generated and stored automatically.</p>
          <SaveRow test={false} />
        </form>
      </Card>
      <p className="small muted">Only SESSION_SECRET, the first sign-in password and the database password have to stay in <code className="mono">.env</code>: the app needs them before it can read anything stored. Changing SESSION_SECRET makes the values saved here unreadable.</p>
    </div>
  );
}

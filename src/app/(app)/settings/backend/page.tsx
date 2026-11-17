import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/current-user";
import { listProviders, storedApplication } from "@/lib/ow/api";
import { getPhoneApp } from "@/lib/domain/phone-code";
import { owConfig } from "@/lib/ow/client";
import { errorMessage } from "@/lib/domain/errors";
import { Card, Notice } from "@/components/ui";
import { bootstrapOwApplication, savePhoneApp } from "../../actions";

export const metadata: Metadata = { title: "Data backend" };

// Admin page (members get a 404). Athletes connect accounts under Connected
// accounts and never see this backend. Install-wide setup lives here; linking
// a person to an existing backend account and their pairing code live on
// their page under Settings → Users.

async function attempt<T>(fn: () => Promise<T>): Promise<{ v: T | null; e: string | null }> {
  try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e: errorMessage(e) }; }
}

export default async function BackendPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  await requireAdmin();

  const cfg = await owConfig();
  if (!cfg) {
    return (
      <Card title="Open Wearables">
        <div className="stack">
          <Notice>Not connected yet. Add the Open Wearables URL and an API key (or developer login) in Credentials.</Notice>
          <div><Link className="btn primary" href="/settings/credentials">Open Credentials</Link></div>
        </div>
      </Card>
    );
  }

  const [providers, app, phoneApp] = await Promise.all([attempt(listProviders), attempt(storedApplication), getPhoneApp()]);
  const enabled = (providers.v ?? []).filter((p) => p.is_enabled);
  const unavailable = enabled.filter((p) => p.has_cloud_api && !p.credentials_configured);

  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Phone app details saved.</p>}
      <p className="small ink2" style={{ maxWidth: 720 }}>
        Athletes only ever see <Link href="/settings/accounts">Connected accounts</Link>. Open Wearables, its users and this application stay on this page.
        The first time an unlinked athlete connects an account, AthleteOS creates their Open Wearables user. To give someone an existing user with history, or a phone pairing code, open them under <Link href="/settings/users">Users</Link>.
      </p>
      {sp.app && <p className="small" style={{ color: "var(--good)" }} role="status">{sp.app === "created" ? "Application created and its secret stored." : "Application already set up."}</p>}

      <div className="grid cols-2">
        <Card title="Backend">
          <dl className="kv">
            <dt>API</dt><dd className="mono">{cfg.base}</dd>
            <dt>Auth</dt><dd>{cfg.apiKey ? "API key" : "Developer login"} · <Link href="/settings/credentials">change</Link></dd>
            <dt>Reachable</dt><dd>{providers.e ? <span style={{ color: "var(--bad)" }}>{providers.e}</span> : "Yes"}</dd>
            <dt>Application</dt><dd>{app.v ? <>{app.v.name} · <span className="mono">{app.v.app_id}</span></> : "Not set up"}</dd>
          </dl>
          <form action={bootstrapOwApplication} className="mt">
            <button className="btn sm" type="submit">{app.v ? "Verify application" : "Create AthleteOS application"}</button>
          </form>
          <p className="small muted mt-sm">Registers an “AthleteOS” application under your developer account. Its secret is shown by OW only once, so AthleteOS stores it.</p>
        </Card>

        <Card title="Phone app" hint="shown in the athlete's setup steps">
          <form action={savePhoneApp} className="stack">
            <label className="field">App name<input name="name" defaultValue={phoneApp.name} maxLength={60} /><span className="help">Empty shows &ldquo;the sync app&rdquo;.</span></label>
            <label className="field">Install link<input name="installUrl" type="url" defaultValue={phoneApp.installUrl} placeholder="https://testflight.apple.com/join/…" /><span className="help">An https link: App Store, TestFlight or Play.</span></label>
            <div><button className="btn primary" type="submit">Save phone app</button></div>
          </form>
        </Card>
      </div>

      {unavailable.length > 0 && (
        <Card title="Hidden from athletes" hint="enabled in Open Wearables, but without provider credentials">
          <p className="small">{unavailable.map((p) => p.name).join(", ")}. Add each provider&apos;s client credentials in Open Wearables and it appears under Connected accounts.</p>
        </Card>
      )}
    </div>
  );
}

import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import Link from "next/link";
import { getUser, listProviders, searchUsers, storedApplication } from "@/lib/ow/api";
import { getPhoneCode } from "@/lib/domain/phone-code";
import { owConfig } from "@/lib/ow/client";
import { errorMessage } from "@/lib/domain/errors";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Notice, StatePill } from "@/components/ui";
import { bootstrapOwApplication, createAndLinkOwUser, linkOwUser, savePhoneCode, updateSettings } from "../../actions";

export const metadata: Metadata = { title: "Data backend" };

// Admin page. Athletes connect accounts under Connected accounts and never see
// this backend; everything that names Open Wearables, its users and its
// application stays here.

async function attempt<T>(fn: () => Promise<T>): Promise<{ v: T | null; e: string | null }> {
  try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e: errorMessage(e) }; }
}

export default async function BackendPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;

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

  const [providers, app, user, phoneCode] = await Promise.all([
    attempt(listProviders),
    attempt(storedApplication),
    ctx.athlete.ow_user_id ? attempt(() => getUser(ctx.athlete.ow_user_id!)) : Promise.resolve({ v: null, e: null }),
    getPhoneCode(ctx.athlete.id),
  ]);
  const q = (sp.q ?? "").trim();
  // Search only on request: the OW instance may hold other people's accounts.
  const found = q.length >= 2 ? await attempt(() => searchUsers(q)) : { v: null, e: null };
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric" }) : "never");
  const enabled = (providers.v ?? []).filter((p) => p.is_enabled);
  const unavailable = enabled.filter((p) => p.has_cloud_api && !p.credentials_configured);
  const phone = enabled.filter((p) => !p.has_cloud_api);

  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.linked && <p className="small" style={{ color: "var(--good)" }} role="status">Athlete linked to the Open Wearables user.</p>}
      {sp.code && <p className="small" style={{ color: "var(--good)" }} role="status">{sp.code === "cleared" ? "Pairing code removed." : "Pairing code saved. The athlete sees it under Connected accounts."}</p>}
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Phone app details saved.</p>}
      <p className="small ink2" style={{ maxWidth: 720 }}>
        Athletes only ever see <Link href="/settings/accounts">Connected accounts</Link>. Open Wearables, its users and this application stay on this page.
        The first time an unlinked athlete connects an account, AthleteOS creates their Open Wearables user; link an existing user here first if they already have history.
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

        <Card title="Athlete ↔ Open Wearables user">
          {ctx.athlete.ow_user_id ? (
            <dl className="kv">
              <dt>Linked user</dt><dd>{user.v ? [user.v.first_name, user.v.last_name].filter(Boolean).join(" ") || user.v.email || "unnamed" : user.e ?? "—"}</dd>
              <dt>User id</dt><dd className="mono">{ctx.athlete.ow_user_id}</dd>
              <dt>Last synced</dt><dd>{user.v ? `${day(user.v.last_synced_at)}${user.v.last_synced_provider ? ` · ${user.v.last_synced_provider}` : ""}` : "—"}</dd>
            </dl>
          ) : <p className="small">Not linked yet. Their first connect creates a user; to keep existing history, find and link that user now.</p>}
          <form method="get" className="row mt" style={{ alignItems: "flex-end" }}>
            <label className="field" style={{ flex: 1 }}>Find a user by name or email<input name="q" defaultValue={q} minLength={2} /></label>
            <button className="btn" type="submit">Search</button>
          </form>
          {found.e && <Notice kind="bad">{found.e}</Notice>}
          {found.v && (
            found.v.length === 0 ? <p className="small muted mt-sm">No users match “{q}”.</p> : (
              <ul className="stack mt-sm" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                {found.v.slice(0, 20).map((u) => (
                  <li key={u.id} className="row between">
                    <span>{[u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "unnamed"} <span className="small muted">· last sync {day(u.last_synced_at)}</span></span>
                    <form action={linkOwUser}><input type="hidden" name="ow_user_id" value={u.id} /><button className="btn sm" type="submit">Link</button></form>
                  </li>
                ))}
              </ul>
            )
          )}
          {!ctx.athlete.ow_user_id && (
            <form action={createAndLinkOwUser} className="row mt" style={{ alignItems: "flex-end" }}>
              <label className="field">First name<input name="first_name" defaultValue={ctx.athlete.name} /></label>
              <label className="field">Last name<input name="last_name" /></label>
              <button className="btn" type="submit">Create and link</button>
            </form>
          )}
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Phone pairing code" hint="Apple Health, Health Connect" action={<StatePill state={phoneCode.state === "set" ? "ok" : phoneCode.state === "unreadable" ? "flag" : "nodata"} label={phoneCode.state === "set" ? "Set" : phoneCode.state === "unreadable" ? "Re-enter" : "Not set"} />}>
          <form action={savePhoneCode} className="stack">
            <label className="field">Pairing code<input name="phone_code" autoComplete="off" spellCheck={false} className="mono" required minLength={4} maxLength={128} /><span className="help">Issued by Open Wearables for {ctx.athlete.ow_user_id ? "the linked user" : "the athlete's user (link or create it first)"}. The athlete sees it on {phone.length ? phone.map((p) => p.name).join(", ") : "the phone"} cards; it is stored encrypted.</span></label>
            {phoneCode.state === "unreadable" && <Notice kind="bad">The saved code was encrypted under a previous SESSION_SECRET and can&apos;t be read. Paste it again.</Notice>}
            <div className="row">
              <button className="btn primary" type="submit">{phoneCode.state === "none" ? "Save code" : "Replace code"}</button>
              {phoneCode.state !== "none" && <button className="btn" type="submit" name="clear" value="1" formNoValidate>Remove code</button>}
            </div>
          </form>
        </Card>

        <Card title="Phone app" hint="shown in the athlete's setup steps">
          <form action={updateSettings} className="stack">
            <input type="hidden" name="back" value="/settings/backend" />
            <label className="field">App name<input name="phoneApp.name" defaultValue={ctx.settings.phoneApp.name} maxLength={60} /><span className="help">Empty shows &ldquo;the sync app&rdquo;.</span></label>
            <label className="field">Install link<input name="phoneApp.installUrl" type="url" defaultValue={ctx.settings.phoneApp.installUrl} placeholder="https://testflight.apple.com/join/…" /><span className="help">An https link: App Store, TestFlight or Play.</span></label>
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

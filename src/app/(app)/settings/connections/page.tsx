import { headers } from "next/headers";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import Link from "next/link";
import { getConnections, getUser, listProviders, searchUsers, storedApplication } from "@/lib/ow/api";
import { owConfig } from "@/lib/ow/client";
import { errorMessage } from "@/lib/domain/errors";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Notice } from "@/components/ui";
import { bootstrapOwApplication, connectProvider, createAndLinkOwUser, linkOwUser, syncNow } from "../../actions";

export const metadata: Metadata = { title: "Open Wearables" };

async function attempt<T>(fn: () => Promise<T>): Promise<{ v: T | null; e: string | null }> {
  try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e: errorMessage(e) }; }
}

export default async function ConnectionsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3020";
  const origin = `${proto}://${host}`;
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

  const [providers, app, user, conns] = await Promise.all([
    attempt(listProviders),
    attempt(storedApplication),
    ctx.athlete.ow_user_id ? attempt(() => getUser(ctx.athlete.ow_user_id!)) : Promise.resolve({ v: null, e: null }),
    ctx.ow ? attempt(() => getConnections(ctx.ow!)) : Promise.resolve({ v: null, e: null }),
  ]);
  const q = (sp.q ?? "").trim();
  // Search only on request: the OW instance may hold other people's accounts.
  const found = q.length >= 2 ? await attempt(() => searchUsers(q)) : { v: null, e: null };
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric" }) : "never");
  const connected = new Map<string, number>();
  for (const c of conns.v ?? []) if (c.status === "active") connected.set(c.provider, (connected.get(c.provider) ?? 0) + 1);

  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.linked && <p className="small" style={{ color: "var(--good)" }} role="status">Athlete linked to the Open Wearables user.</p>}
      {sp.connected && <p className="small" style={{ color: "var(--good)" }} role="status">Returned from {sp.connected}. New data appears after the provider&apos;s first sync.</p>}
      {sp.synced && <p className="small" style={{ color: "var(--good)" }} role="status">Sync requested for {sp.synced}.</p>}
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
          ) : <p className="small">Not linked yet. Find your existing OW user or create one.</p>}
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

      {ctx.ow && (
        <Card title="Connect a provider" hint="OAuth runs on the provider's site, then returns here">
          {providers.v ? (
            <div className="grid cols-4">
              {providers.v.filter((p) => p.is_enabled).map((p) => (
                <div key={p.provider} className="card" style={{ padding: 12 }}>
                  <div className="row between"><b>{p.name}</b>{connected.get(p.provider) ? <span className="pill ok">{connected.get(p.provider)} linked</span> : null}</div>
                  {p.has_cloud_api ? (
                    p.credentials_configured ? (
                      <form action={connectProvider} className="mt-sm">
                        <input type="hidden" name="provider" value={p.provider} /><input type="hidden" name="origin" value={origin} />
                        <button className="btn sm" type="submit">{connected.get(p.provider) ? "Re-authorise" : "Connect"}</button>
                      </form>
                    ) : <p className="small muted mt-sm">Provider credentials aren&apos;t set in Open Wearables yet.</p>
                  ) : <p className="small muted mt-sm">Syncs from the phone app (no cloud API).</p>}
                </div>
              ))}
            </div>
          ) : <Notice kind="bad">{providers.e}</Notice>}
        </Card>
      )}

      {conns.v && (
        <Card title="Connected accounts" className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Provider</th><th>Account</th><th>Purpose</th><th>Status</th><th>Last synced</th><th /></tr></thead>
              <tbody>
                {conns.v.map((c) => (
                  <tr key={c.id}>
                    <td>{c.provider}</td>
                    <td>{c.display_label}{c.device_label && <div className="small muted">{c.device_label}</div>}</td>
                    <td>{c.account_type ?? "—"}</td>
                    <td><span className={`pill ${c.status === "active" ? "ok" : "flag"}`}>{c.status}</span></td>
                    <td>{day(c.last_synced_at)}</td>
                    <td className="num">{c.rest_pull && c.status === "active" && (
                      <form action={syncNow}><input type="hidden" name="provider" value={c.provider} /><button className="btn sm" type="submit">Sync {c.provider} now</button></form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

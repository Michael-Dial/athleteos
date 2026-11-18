import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/domain/context";
import { getConnections, listProviders } from "@/lib/ow/api";
import type { OwConnection, OwProvider } from "@/lib/ow/types";
import { getPhoneApp, getPhoneCode } from "@/lib/domain/phone-code";
import { actsAsAdmin } from "@/lib/current-user";
import { phoneProvidersFor, platformOf } from "@/lib/platform";
import { errorMessage } from "@/lib/domain/errors";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Notice } from "@/components/ui";
import { connectProvider, syncNow } from "../../actions";

export const metadata: Metadata = { title: "Connected accounts" };

// What an athlete sees of the device backend: brands, a Connect button, and
// whether each account is syncing. The backend product, its user ids and its
// application live on the admin's Data backend tab, never here.

async function attempt<T>(fn: () => Promise<T>): Promise<{ v: T | null; e: string | null }> {
  try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e: errorMessage(e) }; }
}

type Status = { kind: "connected"; last: string | null; count: number } | { kind: "lapsed" } | { kind: "none" };

function statusOf(provider: string, conns: OwConnection[]): Status {
  const mine = conns.filter((c) => c.provider === provider);
  const active = mine.filter((c) => c.status === "active");
  if (active.length) {
    const last = active.map((c) => c.last_synced_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
    return { kind: "connected", last, count: active.length };
  }
  return mine.length ? { kind: "lapsed" } : { kind: "none" };
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [ctx, admin] = await Promise.all([getCtx(), actsAsAdmin()]);

  if (!ctx.owConfigured) {
    return (
      <Card title="Connected accounts">
        <Empty admin={admin} />
      </Card>
    );
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3020";
  const origin = `${proto}://${host}`;
  const tz = ctx.settings.timezone;
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric" }) : "not yet");

  const [providers, conns, phoneCode, phoneApp] = await Promise.all([
    attempt(listProviders),
    ctx.ow ? attempt(() => getConnections(ctx.ow!)) : Promise.resolve({ v: [] as OwConnection[], e: null }),
    getPhoneCode(ctx.athlete.id),
    getPhoneApp(),
  ]);
  const all = conns.v ?? [];
  const enabled = (providers.v ?? []).filter((p) => p.is_enabled);
  // A cloud provider without client credentials can't complete OAuth; offering
  // it would only end on an error page, so it waits on the admin's list.
  const cloud = enabled.filter((p) => p.has_cloud_api && p.credentials_configured);
  // The phone's own health store is the obvious first choice, and the other
  // platform's store can't be used from this phone at all.
  const platform = platformOf(h.get("user-agent"));
  const phone = phoneProvidersFor(enabled.filter((p) => !p.has_cloud_api), platform);
  const phoneFirst = platform !== null && phone.length > 0;
  const nameOf = new Map(enabled.map((p) => [p.provider, p.name]));
  const connectedName = sp.connected ? nameOf.get(sp.connected) ?? sp.connected : null;
  const syncedName = sp.synced ? nameOf.get(sp.synced) ?? sp.synced : null;
  const appName = phoneApp.name || "the sync app";

  const wearCard = providers.v && (
        <Card title="Wearable accounts" hint="you sign in on the maker's site, then come back here">
          {cloud.length === 0 ? <p className="small muted">No wearable accounts are available to connect yet.</p> : (
            <div className="grid cols-4">
              {cloud.map((p) => <CloudCard key={p.provider} p={p} s={statusOf(p.provider, all)} origin={origin} day={day} />)}
            </div>
          )}
        </Card>
      );
  const phoneCard = phone.length > 0 && (
        <Card title="On your phone" hint="health data stored on the phone syncs through an app">
          <div className="grid cols-2">
            {phone.map((p) => {
              const s = statusOf(p.provider, all);
              return (
                <div key={p.provider} className="card" style={{ padding: 12 }}>
                  <div className="row between"><b>{p.name}</b><Pill s={s} /></div>
                  {s.kind === "connected" ? (
                    <p className="small muted mt-sm">Last synced {day(s.last)}. Keep {appName} installed; it syncs in the background.</p>
                  ) : phoneCode.state === "set" ? (
                    <ol className="small mt-sm" style={{ paddingLeft: 18, margin: 0 }}>
                      <li>Install {phoneApp.installUrl ? <a href={phoneApp.installUrl} target="_blank" rel="noreferrer">{appName}</a> : appName} on your phone.</li>
                      <li>Open it and enter your code: <code className="mono" style={{ userSelect: "all" }}>{phoneCode.code}</code></li>
                      <li>Allow access to {p.name} when asked.</li>
                    </ol>
                  ) : p.provider === "apple" ? (
                    // The AthleteOS iPhone app signs in and starts Apple Health sync itself; no code needed.
                    <ol className="small mt-sm" style={{ paddingLeft: 18, margin: 0 }}>
                      <li>Install {phoneApp.installUrl ? <a href={phoneApp.installUrl} target="_blank" rel="noreferrer">{phoneApp.name || "the AthleteOS app"}</a> : phoneApp.name || "the AthleteOS app"} on your iPhone and sign in with your AthleteOS email and password.</li>
                      <li>Open More → Connected accounts and turn on {p.name}.</li>
                    </ol>
                  ) : (
                    <p className="small muted mt-sm">
                      {admin
                        ? <>No pairing code yet for this account. <Link href="/settings/users">Add it under Users</Link>, then these steps appear.</>
                        : <>Your admin is setting this up. The steps to connect {p.name} appear here when it&apos;s ready.</>}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      );

  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {connectedName && <p className="small" style={{ color: "var(--good)" }} role="status">{connectedName} is connected. Its data appears after the first sync, usually within a few minutes.</p>}
      {syncedName && <p className="small" style={{ color: "var(--good)" }} role="status">Asked {syncedName} for new data.</p>}
      {providers.e && <Notice kind="bad">{providers.e}</Notice>}
      {conns.e && <Notice kind="bad">{conns.e}</Notice>}

      {phoneFirst ? <>{phoneCard}{wearCard}</> : <>{wearCard}{phoneCard}</>}

      {all.length > 0 && (
        <Card title="Your accounts" className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Service</th><th>Account</th><th>Status</th><th>Last synced</th><th /></tr></thead>
              <tbody>
                {all.map((c) => (
                  <tr key={c.id}>
                    <td>{nameOf.get(c.provider) ?? c.provider}</td>
                    <td>{c.display_label}{c.device_label && <div className="small muted">{c.device_label}</div>}</td>
                    <td><span className={`pill ${c.status === "active" ? "ok" : "flag"}`}>{c.status === "active" ? "Connected" : c.status === "expired" ? "Expired" : "Disconnected"}</span></td>
                    <td>{day(c.last_synced_at)}</td>
                    <td className="num">{c.rest_pull && c.status === "active" && (
                      <form action={syncNow}><input type="hidden" name="provider" value={c.provider} /><button className="btn sm" type="submit">Sync {nameOf.get(c.provider) ?? c.provider} now</button></form>
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

function Empty({ admin }: { admin: boolean }) {
  return (
    <div className="stack">
      <Notice>Account linking isn&apos;t set up on this server yet{admin ? "" : "; your admin needs to finish it"}. Plan, history and questionnaires work without it.</Notice>
      {admin && <div><Link className="btn primary" href="/settings/credentials">Finish setup</Link></div>}
    </div>
  );
}

function Pill({ s }: { s: Status }) {
  if (s.kind === "connected") return <span className="pill ok">{s.count > 1 ? `${s.count} connected` : "Connected"}</span>;
  if (s.kind === "lapsed") return <span className="pill flag">Not syncing</span>;
  return null;
}

function CloudCard({ p, s, origin, day }: { p: OwProvider; s: Status; origin: string; day: (iso: string | null) => string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between"><b>{p.name}</b><Pill s={s} /></div>
      {s.kind === "connected" && <p className="small muted mt-sm">Last synced {day(s.last)}</p>}
      <form action={connectProvider} className="mt-sm">
        <input type="hidden" name="provider" value={p.provider} /><input type="hidden" name="origin" value={origin} />
        <button className={`btn sm${s.kind === "none" ? " primary" : ""}`} type="submit">{s.kind === "none" ? `Connect ${p.name}` : `Reconnect ${p.name}`}</button>
      </form>
    </div>
  );
}

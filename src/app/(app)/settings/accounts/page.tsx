import { headers } from "next/headers";
import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/domain/context";
import { accountsView, type ServiceView } from "@/lib/domain/accounts";
import { getPhoneApp, getPhoneCode } from "@/lib/domain/phone-code";
import { requireUser } from "@/lib/current-user";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Notice } from "@/components/ui";
import { connectProvider, syncNow } from "../../actions";

export const metadata: Metadata = { title: "Connected accounts" };

// What an athlete sees of the device backend: brands, a Connect button, and
// whether each account is syncing. The backend product, its user ids and its
// application live on the admin's Data backend tab, never here. The iPhone
// app's Accounts screen reads the same view (lib/domain/accounts.ts).

export default async function AccountsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const [ctx, user] = await Promise.all([getCtx(), requireUser()]);
  const admin = user.role === "admin";

  if (!ctx.owConfigured) {
    return (
      <Card title="Connected accounts">
        <div className="stack">
          <Notice>Account linking isn&apos;t set up on this server yet{admin ? "" : "; your admin needs to finish it"}. Plan, history and questionnaires work without it.</Notice>
          {admin && <div><Link className="btn primary" href="/settings/credentials">Finish setup</Link></div>}
        </div>
      </Card>
    );
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "http";
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3020";
  const origin = `${proto}://${host}`;
  const tz = ctx.settings.timezone;
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric" }) : "not yet");

  const [view, phoneCode, phoneApp] = await Promise.all([accountsView(ctx), getPhoneCode(ctx.athlete.id), getPhoneApp()]);
  const cloud = view.services.filter((v) => v.kind === "cloud");
  const phone = view.services.filter((v) => v.kind === "phone");
  const nameOf = new Map(view.services.map((v) => [v.provider, v.name]));
  const connectedName = sp.connected ? nameOf.get(sp.connected) ?? sp.connected : null;
  const syncedName = sp.synced ? nameOf.get(sp.synced) ?? sp.synced : null;
  const appName = phoneApp.name || "the AthleteOS app";
  const app = phoneApp.installUrl ? <a href={phoneApp.installUrl} target="_blank" rel="noreferrer">{appName}</a> : appName;

  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {connectedName && <p className="small" style={{ color: "var(--good)" }} role="status">{connectedName} is connected. Its data appears after the first sync, usually within a few minutes.</p>}
      {syncedName && <p className="small" style={{ color: "var(--good)" }} role="status">Asked {syncedName} for new data.</p>}
      {view.errors.map((e) => <Notice key={e} kind="bad">{e}</Notice>)}

      {view.errors.length === 0 && (
        <Card title="Wearable accounts" hint="you sign in on the maker's site, then come back here">
          {cloud.length === 0 ? <p className="small muted">No wearable accounts are available to connect yet.</p> : (
            <div className="grid cols-4">
              {cloud.map((p) => <CloudCard key={p.provider} p={p} origin={origin} day={day} />)}
            </div>
          )}
        </Card>
      )}

      {phone.length > 0 && (
        <Card title="On your phone" hint="health data stored on the phone syncs through the app">
          <div className="grid cols-2">
            {phone.map((p) => (
              <div key={p.provider} className="card" style={{ padding: 12 }}>
                <div className="row between"><b>{p.name}</b><Pill s={p} /></div>
                {p.status === "connected" ? (
                  <p className="small muted mt-sm">Last synced {day(p.lastSyncedAt)}. Keep {appName} installed; it syncs in the background.</p>
                ) : phoneCode.state === "set" ? (
                  // An admin issued a pairing code for a separate sync app: show it as before.
                  <ol className="small mt-sm" style={{ paddingLeft: 18, margin: 0 }}>
                    <li>Install {app} on your phone.</li>
                    <li>Open it and enter your code: <code className="mono" style={{ userSelect: "all" }}>{phoneCode.code}</code></li>
                    <li>Allow access to {p.name} when asked.</li>
                  </ol>
                ) : (
                  <ol className="small mt-sm" style={{ paddingLeft: 18, margin: 0 }}>
                    <li>Install {app} on your iPhone and sign in with your AthleteOS email and password.</li>
                    <li>Open More → Connected accounts and turn on {p.name}.</li>
                  </ol>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      {view.accounts.length > 0 && (
        <Card title="Your accounts" className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Service</th><th>Account</th><th>Status</th><th>Last synced</th><th /></tr></thead>
              <tbody>
                {view.accounts.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{c.label}{c.device && <div className="small muted">{c.device}</div>}</td>
                    <td><span className={`pill ${c.status === "connected" ? "ok" : "flag"}`}>{c.status === "connected" ? "Connected" : c.status === "expired" ? "Expired" : "Disconnected"}</span></td>
                    <td>{day(c.lastSyncedAt)}</td>
                    <td className="num">{c.canSync && (
                      <form action={syncNow}><input type="hidden" name="provider" value={c.provider} /><button className="btn sm" type="submit">Sync {c.name} now</button></form>
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

function Pill({ s }: { s: ServiceView }) {
  if (s.status === "connected") return <span className="pill ok">{s.count > 1 ? `${s.count} connected` : "Connected"}</span>;
  if (s.status === "lapsed") return <span className="pill flag">Not syncing</span>;
  return null;
}

function CloudCard({ p, origin, day }: { p: ServiceView; origin: string; day: (iso: string | null) => string }) {
  return (
    <div className="card" style={{ padding: 12 }}>
      <div className="row between"><b>{p.name}</b><Pill s={p} /></div>
      {p.status === "connected" && <p className="small muted mt-sm">Last synced {day(p.lastSyncedAt)}</p>}
      <form action={connectProvider} className="mt-sm">
        <input type="hidden" name="provider" value={p.provider} /><input type="hidden" name="origin" value={origin} />
        <button className={`btn sm${p.status === "none" ? " primary" : ""}`} type="submit">{p.status === "none" ? `Connect ${p.name}` : `Reconnect ${p.name}`}</button>
      </form>
    </div>
  );
}

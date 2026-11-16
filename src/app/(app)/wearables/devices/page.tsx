import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getConnections, getDevices, getDevicesHistory } from "@/lib/ow/api";
import { errorMessage } from "@/lib/domain/errors";
import { fmtDate, localDate } from "@/lib/dates";
import { Card, Empty } from "@/components/ui";
import { OwErrors } from "@/components/setup-banner";

export const metadata: Metadata = { title: "Devices" };

export default async function DevicesPage() {
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const [devices, history, conns] = await Promise.all([
    getDevices(ctx.ow!).then((v) => ({ v, e: null as string | null })).catch((e) => ({ v: [], e: errorMessage(e) })),
    getDevicesHistory(ctx.ow!).then((v) => ({ v, e: null as string | null })).catch((e) => ({ v: { items: [], total: 0 }, e: errorMessage(e) })),
    getConnections(ctx.ow!).then((v) => ({ v, e: null as string | null })).catch((e) => ({ v: [], e: errorMessage(e) })),
  ]);
  const active = devices.v.filter((d) => d.is_active).sort((a, b) => (b.last_seen_at ?? "").localeCompare(a.last_seen_at ?? ""));
  const retired = devices.v.filter((d) => !d.is_active);
  const devName = new Map(devices.v.map((d) => [d.id, d.display_name]));
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric", year: "numeric" }) : "—");

  return (
    <div className="stack-lg">
      <OwErrors errors={[devices.e, history.e, conns.e]} />
      <p className="small muted">Devices are managed in Open Wearables (labels, merges, retirement). AthleteOS reads them to name every number and to let you <Link href="/settings/devices">rank devices per metric</Link>.</p>
      <Card title={`Devices (${active.length} active)`} className="flush">
        {active.length === 0 ? <Empty title="No devices yet">They appear once a connected provider syncs data.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Device</th><th>Type</th><th>Brand / model</th><th className="num">Sources</th><th>First seen</th><th>Last seen</th><th>Device id</th></tr></thead>
              <tbody>
                {active.map((d) => (
                  <tr key={d.id}>
                    <td><b>{d.display_name}</b>{d.label && d.label !== d.display_name && <div className="small muted">{d.label}</div>}</td>
                    <td>{d.device_type}</td>
                    <td className="small">{[d.brand, d.model_display ?? d.model_raw].filter(Boolean).join(" · ")}</td>
                    <td className="num">{d.data_sources.length}</td>
                    <td>{day(d.first_seen_at)}</td>
                    <td>{day(d.last_seen_at)}</td>
                    <td className="mono">{d.id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {retired.length > 0 && (
        <Card title={`Retired (${retired.length})`} className="flush">
          <div className="table-wrap"><table className="t"><tbody>
            {retired.map((d) => <tr key={d.id}><td>{d.display_name}</td><td>{d.device_type}</td><td>retired {day(d.retired_at)}</td><td className="mono">{d.id}</td></tr>)}
          </tbody></table></div>
        </Card>
      )}
      <Card title="Provider accounts" className="flush" action={<Link className="small" href="/settings/connections">Manage</Link>}>
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Provider</th><th>Account</th><th>Type</th><th>Status</th><th>Sync</th><th>Last synced</th></tr></thead>
            <tbody>
              {conns.v.map((c) => (
                <tr key={c.id}>
                  <td>{c.provider}</td><td>{c.display_label}{c.device_label && <div className="small muted">{c.device_label}</div>}</td>
                  <td>{c.account_type ?? "—"}</td>
                  <td><span className={`pill ${c.status === "active" ? "ok" : "flag"}`}>{c.status}</span></td>
                  <td className="small">{c.live_sync_mode ?? (c.rest_pull ? "pull" : "—")}</td>
                  <td>{day(c.last_synced_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Attribution history" hint={history.v.total > history.v.items.length ? `newest ${history.v.items.length} of ${history.v.total}` : `${history.v.total} entries`} className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>When</th><th>Device</th><th>Action</th><th>Change</th><th>By</th><th>Reason</th></tr></thead>
            <tbody>
              {history.v.items.slice(0, 200).map((h) => (
                <tr key={h.id}>
                  <td style={{ whiteSpace: "nowrap" }}>{day(h.created_at)}</td>
                  <td>{(h.device_id && devName.get(h.device_id)) ?? <span className="mono">{h.device_id?.slice(0, 8) ?? "—"}</span>}</td>
                  <td>{h.action}</td>
                  <td className="small">{h.field ? `${h.field}: ${h.old_value ?? "∅"} → ${h.new_value ?? "∅"}` : ""}</td>
                  <td className="small">{h.actor}</td>
                  <td className="small">{h.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {history.v.items.length > 200 && <p className="small muted" style={{ padding: "8px 16px" }}>Showing the newest 200 here.</p>}
      </Card>
    </div>
  );
}

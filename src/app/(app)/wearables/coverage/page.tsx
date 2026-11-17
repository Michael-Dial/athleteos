import type { Metadata } from "next";
import Link from "next/link";
import { getCtx } from "@/lib/domain/context";
import { getCoverage } from "@/lib/domain/coverage";
import { fmtDate } from "@/lib/dates";
import { METRIC_LABEL } from "@/lib/settings";
import { Card, Empty, Notice, SourceChip, StatePill, fmt } from "@/components/ui";
import { OwErrors } from "@/components/setup-banner";
import { RangeSeg, pickDays } from "@/components/range-seg";

export const metadata: Metadata = { title: "Coverage" };

const short = (d: string) => fmtDate(d, { month: "short", day: "numeric" });
const ago = (h: number | null) => (h == null ? "never" : h < 1 ? "< 1 h ago" : h < 48 ? `${Math.round(h)} h ago` : `${Math.round(h / 24)} d ago`);

export default async function CoveragePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = pickDays(sp.days, [30, 60, 90], 60);
  const ctx = await getCtx();
  const c = await getCoverage(ctx, days);
  const stale = c.connections.filter((x) => x.stale);
  const metricName = (m: string) => (m in METRIC_LABEL ? METRIC_LABEL[m as keyof typeof METRIC_LABEL] : m);

  return (
    <div className="stack-lg">
      <div className="row between">
        <p className="small muted">Which devices reported each night, whether sync is current, and how complete your own inputs are. Gaps here distort baselines silently.</p>
        <RangeSeg base="/wearables/coverage" days={days} options={[30, 60, 90]} />
      </div>
      <OwErrors errors={c.owErrors} />
      <div className="grid cols-4">
        <Card>
          <div className="stat-label">Device data service</div>
          <div className="row mt-sm"><StatePill state={c.ow.reachable ? "ok" : "flag"} label={c.ow.reachable ? "Reachable" : "Unreachable"} />{c.ow.latencyMs != null && <span className="small muted">{c.ow.latencyMs} ms</span>}</div>
          {c.ow.error && <p className="small mt-sm">{c.ow.error}</p>}
        </Card>
        <Card>
          <div className="stat-label">Provider accounts</div>
          <div className="stat-value">{c.connections.length - stale.length}<span className="unit">/ {c.connections.length} current</span></div>
          <div className="stat-sub">{stale.length ? `${stale.length} with no sync in ${ctx.settings.coverage.staleHours} h` : "all synced recently"}</div>
        </Card>
        <Card>
          <div className="stat-label">Questionnaire adherence</div>
          {c.questionnaires.map((q) => <div key={q.slug} className="stat-value" style={{ fontSize: 22 }}>{Math.round(q.pct)}%<span className="unit">{q.answered}/{q.days} days</span></div>)}
          <div className="stat-sub">daily forms, last {ctx.settings.coverage.adherenceDays} days</div>
        </Card>
        <Card>
          <div className="stat-label">Sessions without load</div>
          <div className="stat-value">{c.unratedSessions}</div>
          <div className="stat-sub">last {ctx.settings.coverage.adherenceDays} days · <Link href="/history">rate on History</Link></div>
        </Card>
      </div>

      <Card title="Baseline devices" hint="the single device behind each baseline, and how complete it is" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Metric</th><th>Device</th><th className="num">Nights covered</th><th className="num">Longest gap</th><th>Last night</th></tr></thead>
            <tbody>{c.baselines.map((b) => (
              <tr key={b.metric}>
                <td>{metricName(b.metric)}</td>
                <td>{b.device ? <SourceChip name={b.device.name} fallback={b.device.fallback} /> : "—"}</td>
                <td className="num">{b.pct != null ? `${fmt(b.pct)}%` : "—"}</td>
                <td className="num">{b.longestGap != null ? `${b.longestGap} night${b.longestGap === 1 ? "" : "s"}` : "—"}</td>
                <td>{b.lastNight ? short(b.lastNight) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Nights reported, by device" hint={`${short(c.start)} – ${short(c.end)}`}>
        {c.devices.length === 0 ? <Empty title="No overnight data in this window" /> : (
          <>
            <div className="legend small">
              <span><i className="legend-swatch" style={{ background: "var(--surface-2)", border: "1px solid var(--line)" }} />Nothing</span>
              <span><i className="legend-swatch" style={{ background: "#86b6ef" }} />Sleep or vitals, no HRV</span>
              <span><i className="legend-swatch" style={{ background: "#256abf" }} />Including HRV</span>
            </div>
            {/* Focusable so keyboard users can scroll the grid when it is wider than the screen. */}
            <div className="table-wrap" tabIndex={0} aria-label="Device coverage by night, scrollable">
              <div className="heat" style={{ gridTemplateColumns: `minmax(120px, 220px) repeat(${c.dates.length}, 9px) auto` }} role="table" aria-label="Device coverage by night">
                <div style={{ display: "contents" }} role="row">
                  <span role="columnheader" className="tick">Device</span>
                  {c.dates.map((d, i) => <span key={d} role="columnheader" aria-label={short(d)} className="tick" style={{ gridColumn: `span 1` }}>{i % 7 === 0 ? short(d) : ""}</span>)}
                  <span role="columnheader" className="tick">Nights</span>
                </div>
                {c.devices.map((dv) => (
                  <div key={dv.key} style={{ display: "contents" }} role="row">
                    <span role="rowheader" className="name" title={dv.name}>{dv.name}</span>
                    {dv.cells.split("").map((s, i) => {
                      const label = `${dv.name} · ${short(c.dates[i])}: ${s === "2" ? "with HRV" : s === "1" ? "no HRV" : "nothing"}`;
                      return <span key={i} role="cell" aria-label={label} className={`cell s${s}`} title={label} />;
                    })}
                    <span role="cell" className="tick" style={{ paddingLeft: 8 }}>{dv.nights}/{c.dates.length}{dv.longestGap >= 3 && dv.nights > 0 ? ` · gap ${dv.longestGap}` : ""}</span>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Card>

      <div className="grid cols-2">
        <Card title="Sync status" className="flush">
          {c.connections.length === 0 ? <Empty title="No provider accounts" /> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Provider</th><th>Account</th><th>Last sync</th><th>State</th></tr></thead>
                <tbody>{c.connections.map((x) => (
                  <tr key={x.provider + x.account}>
                    <td>{x.provider}</td><td className="small">{x.account}</td><td>{ago(x.hoursSinceSync)}</td>
                    <td>{x.status !== "active" ? <StatePill state="flag" label={x.status} /> : x.stale ? <StatePill state="watch" label="Quiet" /> : <StatePill state="ok" label="Current" />}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          {stale.length > 0 && <p className="small muted" style={{ padding: "8px 16px 16px" }}>“Quiet” accounts may just have no new data (webhook providers only sync on change); check the device if one you wear daily is quiet.</p>}
        </Card>
        <Card title="Missing questionnaire days" hint="most recent 14">
          {c.questionnaires.every((q) => q.missing.length === 0) ? <Empty title="Nothing missing" /> : c.questionnaires.map((q) => (
            <div key={q.slug} className="stack" style={{ gap: 4 }}>
              <h3>{q.name}</h3>
              <div className="row" style={{ gap: 6 }}>{q.missing.map((d) => <Link key={d} className="chip" href={`/wellness/${q.slug}?date=${d}`}>{short(d)}</Link>)}</div>
            </div>
          ))}
          {c.questionnaires.some((q) => q.missing.length) && <Notice kind="info">Back-filling a missed day from memory is possible but less reliable than answering on the day.</Notice>}
        </Card>
      </div>
    </div>
  );
}

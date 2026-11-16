import Link from "next/link";
import type { Readiness } from "@/lib/domain/readiness";
import { rankNight, type NightRow } from "@/lib/domain/nightly";
import type { AppCtx } from "@/lib/domain/context";
import { fmtDuration } from "@/lib/dates";
import { Card, OtherSources, SourceChip, StatePill, fmt, fmtSigned, type UiState } from "./ui";

const OVERALL: Record<Readiness["overall"], { label: string; state: UiState; text: string }> = {
  green: { label: "Ready", state: "ok", text: "Recovery markers are within your normal ranges." },
  amber: { label: "Caution", state: "watch", text: "One or more markers are outside your normal range. Consider the plan with that in mind." },
  red: { label: "Compromised", state: "flag", text: "Several markers are well below your baselines. Consider reducing intensity today." },
  unknown: { label: "Not enough data", state: "nodata", text: "At least two pillars need a baseline before readiness can be summarised." },
};

export function ReadinessCard({ r, compact = false }: { r: Readiness; compact?: boolean }) {
  const o = OVERALL[r.overall];
  const rows: { name: string; href: string; state: UiState; detail: string }[] = [
    { name: "HRV (7-day lnRMSSD)", href: "/wearables", state: r.hrv.state, detail: r.hrv.point?.status === "insufficient" || !r.hrv.point ? "—" : `${r.hrv.point.status} normal range` },
    { name: "Resting HR", href: "/wearables", state: r.rhr.state, detail: r.rhr.z?.z != null ? `z ${fmtSigned(r.rhr.z.z)}` : "—" },
    { name: "Sleep duration", href: "/wearables/sleep", state: r.sleep.state, detail: r.sleep.z?.value != null ? fmtDuration(r.sleep.z.value) : "—" },
    { name: "Wellness", href: "/wellness", state: r.wellness.state, detail: r.wellness.today ? `${fmt(r.wellness.today.composite)}/100` : "—" },
    { name: "Load (ACWR)", href: "/history", state: r.load.state, detail: r.load.point?.acwr != null ? fmt(r.load.point.acwr, 2) : "—" },
  ];
  return (
    <Card title="Readiness" hint="rule-based, vs your own baselines" action={!compact ? undefined : <Link href="/readiness" className="small">Details</Link>}>
      <div className="readiness-hero">
        <StatePill state={o.state} label={o.label} />
        <span className="small ink2">Index {r.index == null ? "—" : fmtSigned(r.index, 2)} SD</span>
      </div>
      <p className="small ink2 mt-sm">{o.text}</p>
      <table className="t mt-sm">
        <tbody>
          {rows.map((x) => (
            <tr key={x.name}>
              <td><Link href={x.href}>{x.name}</Link></td>
              <td className="num ink2">{x.detail}</td>
              <td className="num"><StatePill state={x.state} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

type NightMetric = "hrv" | "rhr" | "sleep" | "respiratory_rate" | "spo2";

/** Last-night value for a metric: primary device by priority, every other device listed. */
export function NightStat({ ctx, rows, date, metric, label, unit, digits = 0, children }: {
  ctx: AppCtx; rows: NightRow[]; date: string; metric: NightMetric; label: string; unit: string; digits?: number; children?: React.ReactNode;
}) {
  const ranked = rankNight(ctx, rows, date, metric);
  const get = (r: NightRow) => (metric === "hrv" ? r.hrv : metric === "rhr" ? r.rhr : metric === "sleep" ? r.sleepMin : metric === "respiratory_rate" ? r.rr : r.spo2);
  const p = ranked.primary;
  const value = p ? get(p) : null;
  return (
    <Card>
      <div className="stack" style={{ gap: 6 }}>
        <div className="stat-label">{label}</div>
        <div className="stat-value">
          {metric === "sleep" ? fmtDuration(value) : fmt(value, digits)}
          {metric !== "sleep" && value != null && <span className="unit">{unit}</span>}
        </div>
        {children}
        {p ? <div><SourceChip name={p.name} fallback={ranked.fallback} /></div> : <p className="small muted">No device reported this for {date}.</p>}
        <OtherSources
          items={ranked.others.map((o) => ({ name: o.name, value: get(o) }))}
          format={(v) => (metric === "sleep" ? fmtDuration(v) : `${fmt(v, digits)} ${unit}`)}
        />
      </div>
    </Card>
  );
}

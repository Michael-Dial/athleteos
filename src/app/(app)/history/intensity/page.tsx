import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getIntensity } from "@/lib/domain/intensity";
import { addDays, fmtDate, fmtDuration, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL, isSportFamily } from "@/lib/sports";
import { REFS } from "@/lib/references";
import { Card, Empty, Notice, fmt } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { TimeChart } from "@/components/charts";

export const metadata: Metadata = { title: "Intensity distribution" };

const WINDOWS = [4, 8, 12, 26];
const PATTERN: Record<string, string> = { polarized: "Polarized", pyramidal: "Pyramidal", threshold: "Threshold", "high-intensity": "High-intensity", insufficient: "—" };
const pct = (z: [number, number, number], i: number) => { const t = z[0] + z[1] + z[2]; return t ? `${Math.round((z[i] / t) * 100)}%` : "—"; };

export default async function IntensityPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const weeks = WINDOWS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const start = addDays(startOfWeek(today), -7 * (weeks - 1));
  const r = await getIntensity(ctx, start, today);
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const b = r.bounds;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Intensity distribution</h1>
          <p className="sub">Time in three heart-rate zones per week, from each session&apos;s primary recording.</p>
        </div>
        <div className="row">
          <div className="seg">{WINDOWS.map((w) => <Link key={w} href={`/history/intensity?weeks=${w}`} className={w === weeks ? "on" : ""}>{w} wk</Link>)}</div>
          <Link className="btn" href="/history">Sessions</Link>
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.owErrors} />
      {b.source === "hrmax" && (
        <Notice>
          Zones use %HRmax approximations (Z1 ≤ {b.z1MaxBpm} bpm, Z3 &gt; {b.z2MaxBpm} bpm from HRmax {ctx.settings.load.hrMax}). Set your tested LT1/LT2 heart rates in <Link href="/settings#intensity">Settings</Link> for zones anchored to your thresholds.
        </Notice>
      )}

      <div className="grid cols-4">
        <Card><div className="stat-label">Z1 (≤ {b.z1MaxBpm} bpm)</div><div className="stat-value">{pct(r.total.zonesMin, 0)}</div><div className="stat-sub">{fmtDuration(r.total.zonesMin[0])}</div></Card>
        <Card><div className="stat-label">Z2 ({b.z1MaxBpm + 1}–{b.z2MaxBpm} bpm)</div><div className="stat-value">{pct(r.total.zonesMin, 1)}</div><div className="stat-sub">{fmtDuration(r.total.zonesMin[1])}</div></Card>
        <Card><div className="stat-label">Z3 (&gt; {b.z2MaxBpm} bpm)</div><div className="stat-value">{pct(r.total.zonesMin, 2)}</div><div className="stat-sub">{fmtDuration(r.total.zonesMin[2])}</div></Card>
        <Card><div className="stat-label">Pattern · Polarization-Index</div><div className="stat-value" style={{ fontSize: 22 }}>{PATTERN[r.total.pattern]}</div><div className="stat-sub">PI {fmt(r.total.polarizationIndex, 2)}{r.total.noHrMin > 0 ? ` · ${fmtDuration(r.total.noHrMin)} without HR` : ""}</div></Card>
      </div>

      <Card title="Weekly time in zone" hint="minutes">
        <TimeChart ariaLabel="Weekly minutes in each heart-rate zone" unit="min" height={240}
          series={[
            { id: "z1", label: "Z1", color: "var(--z1)", kind: "bar", points: r.weeks.map((w) => [dx(w.weekStart), Math.round(w.zonesMin[0]) || null]) },
            { id: "z2", label: "Z2", color: "var(--z2)", kind: "bar", points: r.weeks.map((w) => [dx(w.weekStart), Math.round(w.zonesMin[1]) || null]) },
            { id: "z3", label: "Z3", color: "var(--z3)", kind: "bar", points: r.weeks.map((w) => [dx(w.weekStart), Math.round(w.zonesMin[2]) || null]) },
          ]} />
      </Card>

      <Card title="By week" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Week of</th><th className="num">Sessions</th><th className="num">Z1</th><th className="num">Z2</th><th className="num">Z3</th><th>Pattern</th><th className="num">PI</th><th className="num">No HR</th></tr></thead>
            <tbody>{[...r.weeks].reverse().map((w) => (
              <tr key={w.weekStart}>
                <td>{fmtDate(w.weekStart, { month: "short", day: "numeric" })}</td><td className="num">{w.sessions}</td>
                <td className="num">{pct(w.zonesMin, 0)}</td><td className="num">{pct(w.zonesMin, 1)}</td><td className="num">{pct(w.zonesMin, 2)}</td>
                <td>{PATTERN[w.pattern]}</td><td className="num">{fmt(w.polarizationIndex, 2)}</td><td className="num">{w.noHrMin ? fmtDuration(w.noHrMin) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Sessions" className="flush">
        {r.sessions.length === 0 ? <Empty title="No sessions in this window" /> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Date</th><th>Session</th><th className="num">Time</th><th className="num">Z1</th><th className="num">Z2</th><th className="num">Z3</th><th>HR source</th></tr></thead>
              <tbody>{[...r.sessions].reverse().map((x) => (
                <tr key={x.key}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(x.date)}</td>
                  <td><Link href={`/history/session?key=${encodeURIComponent(x.key)}&date=${x.date}`}>{x.title}</Link><div className="small muted">{isSportFamily(x.sport) ? SPORT_LABEL[x.sport] : x.sport}</div></td>
                  <td className="num">{fmtDuration(x.durationMin)}</td>
                  {x.zonesMin ? x.zonesMin.map((m, i) => <td key={i} className="num">{fmtDuration(m)}</td>) : <td colSpan={3} className="num small muted">{x.reason}</td>}
                  <td className="small">{x.device}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="small muted">
        Three-zone model after <a href={REFS.seiler2006.url} target="_blank" rel="noreferrer">Seiler &amp; Kjerland (2006)</a>; Polarization-Index per <a href={REFS.treff2019.url} target="_blank" rel="noreferrer">Treff et al. (2019)</a>, computed only when Z1 &gt; Z3 &gt; Z2, with PI &gt; 2.00 classed as polarized.
        Zones come from 1-minute mean HR, which slightly under-counts short Z3 efforts; HR also lags intensity in short intervals.
      </p>
    </div>
  );
}

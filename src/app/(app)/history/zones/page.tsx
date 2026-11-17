import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getZoneReport, type ZoneReport } from "@/lib/domain/zone-report";
import { addDays, fmtDate, fmtDuration, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL, isSportFamily } from "@/lib/sports";
import { METRIC_INFO, ZONE_METRICS, fmtPace, type Band, type ZoneMetric } from "@/lib/zones";
import { Card, Empty, Notice } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { ZoneBar, zoneColor } from "@/components/zone-bars";

export const metadata: Metadata = { title: "Time in zone" };

const WINDOWS = [4, 8, 12, 26, 52];
const SPORTS = [["all", "All sports"], ["run", "Run"], ["ride", "Ride"], ["other", "Other"]] as const;

function range(metric: ZoneMetric, b: Band): string {
  if (metric === "pace") {
    if (b.from == null) return `slower than ${fmtPace(b.to)}/km`;
    if (b.to == null) return `faster than ${fmtPace(b.from)}/km`;
    return `${fmtPace(b.from)}–${fmtPace(b.to)}/km`;
  }
  const u = METRIC_INFO[metric].unit;
  if (b.from == null) return `≤ ${b.to} ${u}`;
  if (b.to == null) return `> ${b.from} ${u}`;
  return `${b.from + 1}–${b.to} ${u}`;
}

export default async function ZonesPage({ searchParams }: { searchParams: Promise<{ metric?: string; weeks?: string; sport?: string }> }) {
  const sp = await searchParams;
  const metric: ZoneMetric = (ZONE_METRICS as readonly string[]).includes(sp.metric ?? "") ? (sp.metric as ZoneMetric) : "hr";
  const weeks = WINDOWS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 12;
  const sport = (SPORTS.map((s) => s[0]) as string[]).includes(sp.sport ?? "") && metric === "hr" ? (sp.sport as ZoneReport["sport"]) : "all";
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const start = addDays(startOfWeek(today), -7 * (weeks - 1));
  const r = await getZoneReport(ctx, metric, start, today, sport);
  const q = (o: Record<string, string | number>) => `/history/zones?${new URLSearchParams({ metric, weeks: String(weeks), sport, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })}`;
  const bands = r.zoneSet?.bands ?? [];

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Time in zone</h1>
          <p className="sub">Share of recorded time in each zone. Only time with a {r.label.toLowerCase()} signal counts, so sessions without the sensor don&apos;t dilute it.</p>
        </div>
        <div className="row">
          <div className="seg">{WINDOWS.map((w) => <Link key={w} href={q({ weeks: w })} className={w === weeks ? "on" : ""}>{w < 52 ? `${w} wk` : "1 yr"}</Link>)}</div>
          <Link className="btn" href="/settings/zones">Zone settings</Link>
        </div>
      </div>
      <div className="row">
        <div className="seg">{ZONE_METRICS.map((m) => <Link key={m} href={`/history/zones?metric=${m}&weeks=${weeks}`} className={m === metric ? "on" : ""}>{METRIC_INFO[m].label}</Link>)}</div>
        {metric === "hr" && <div className="seg">{SPORTS.map(([k, l]) => <Link key={k} href={q({ sport: k })} className={k === sport ? "on" : ""}>{l}</Link>)}</div>}
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.owErrors} />
      {r.needs && <Notice>{r.needs.reason} to see {r.label.toLowerCase()} zones. <Link href="/settings/zones">Open zone settings</Link></Notice>}

      {r.zoneSet && (
        <>
          <Card title={`${r.label} · ${r.zoneSet.modelLabel}`} hint={`${fmtDate(r.start, { month: "short", day: "numeric" })} – ${fmtDate(r.end, { month: "short", day: "numeric" })}`}>
            {r.total.recordedSec === 0 ? (
              <Empty title={`No ${r.label.toLowerCase()} recorded in this window`}>
                {metric === "bikepower" ? "None of your rides in this window carry power data; it appears once a power meter syncs through a connected account." : `${r.total.sessionsWithout} session${r.total.sessionsWithout === 1 ? "" : "s"} had no ${r.label.toLowerCase()} from any of their devices.`}
              </Empty>
            ) : (
              <div className="stack">
                <ZoneBar seconds={r.total.seconds} bands={bands} large label={`${r.label} distribution`} />
                <div className="table-wrap">
                  <table className="t">
                    <thead><tr><th>Zone</th><th>Range</th><th className="num">Time</th><th className="num">Share</th></tr></thead>
                    <tbody>{bands.map((b, i) => (
                      <tr key={b.name}>
                        <td><span className="row" style={{ gap: 8 }}><span className="dot" style={{ background: zoneColor(i, bands.length), borderRadius: 2 }} />{b.name}</span></td>
                        <td className="ink2">{range(metric, b)}</td>
                        <td className="num">{fmtDuration(r.total.seconds[i] / 60)}</td>
                        <td className="num"><b>{r.total.pct[i].toFixed(1)}%</b></td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
                <p className="small muted">{fmtDuration(r.total.recordedSec / 60)} recorded across {r.total.sessions} session{r.total.sessions === 1 ? "" : "s"}{r.total.sessionsWithout ? `; ${r.total.sessionsWithout} more had no ${r.label.toLowerCase()} signal and are left out` : ""}.</p>
              </div>
            )}
          </Card>

          {r.total.recordedSec > 0 && (
            <Card title="By week" hint="each bar is that week's distribution; time recorded on the right">
              <div className="stack" style={{ gap: 6 }}>
                {[...r.weeks].reverse().map((w) => (
                  <div key={w.weekStart} className="zrow">
                    <span className="ink2">{fmtDate(w.weekStart, { month: "short", day: "numeric" })}</span>
                    {w.recordedSec > 0 ? <ZoneBar seconds={w.seconds} bands={bands} label={`Week of ${w.weekStart}`} /> : <span className="small muted">—</span>}
                    <span className="num ink2" style={{ textAlign: "right" }}>{w.recordedSec ? fmtDuration(w.recordedSec / 60) : ""}</span>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <Card title="Sessions" className="flush">
            {r.sessions.length === 0 ? <Empty title="No matching sessions in this window" /> : (
              <div className="table-wrap">
                <table className="t">
                  <thead><tr><th>Date</th><th>Session</th><th className="num">Time</th><th style={{ minWidth: 200 }}>Distribution</th><th>From device</th></tr></thead>
                  <tbody>{[...r.sessions].reverse().map((x) => (
                    <tr key={x.key}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(x.date)}</td>
                      <td><Link href={`/history/session?key=${encodeURIComponent(x.key)}&date=${x.date}`}>{x.title}</Link><div className="small muted">{isSportFamily(x.sport) ? SPORT_LABEL[x.sport] : x.sport}</div></td>
                      <td className="num">{fmtDuration(x.durationMin)}</td>
                      <td>{x.seconds ? <ZoneBar seconds={x.seconds} bands={bands} label={x.title} /> : <span className="small muted">{x.reason}</span>}</td>
                      <td className="small">{x.device ?? "—"}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
      <p className="small muted">
        Zones come from 1-minute means of each signal, which smooth short surges. {metric === "pace" && "Pace is not grade-adjusted, so hilly runs read slower uphill and faster downhill. Below 16:40/km counts as stopped. "}
        {metric === "runpower" && "Running power algorithms differ by device (Garmin vs Apple vs Stryd); set CP from the same device you train with. Zero watts counts as stopped. "}
        {metric === "bikepower" && "Zero-watt samples (coasting) count toward L1, as power software conventionally does. "}
        Each session&apos;s signal is taken whole from the highest-priority device that recorded it.
      </p>
    </div>
  );
}

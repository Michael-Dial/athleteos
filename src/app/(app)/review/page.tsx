import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getWeeklyReview } from "@/lib/domain/review";
import { addDays, fmtDate, fmtDuration, isISODate, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL, isSportFamily } from "@/lib/sports";
import { REFS } from "@/lib/references";
import { Card, Empty, Notice, SourceChip, fmt } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { IconLeft, IconRight } from "@/components/icons";

export const metadata: Metadata = { title: "Weekly review" };

const wk = (d: string) => fmtDate(d, { month: "short", day: "numeric" });

export default async function ReviewPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const thisWeek = startOfWeek(today);
  const week = isISODate(sp.week) && startOfWeek(sp.week) <= thisWeek ? startOfWeek(sp.week) : thisWeek;
  const r = await getWeeklyReview(ctx, week);
  const t = r.training;
  const cur = (w: string) => (w === r.weekStart ? { background: "var(--accent-weak)", fontWeight: 600 } : undefined);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Week of {fmtDate(r.weekStart, { month: "long", day: "numeric", year: "numeric" })}</h1>
          <p className="sub">{r.daysElapsed < 7 ? `In progress: ${r.daysElapsed} of 7 days so far. ` : ""}Compared with the previous {ctx.settings.review.comparisonWeeks} weeks; each overnight metric uses one device.</p>
        </div>
        <div className="row">
          <Link className="btn icon" href={`/review?week=${addDays(week, -7)}`} aria-label="Previous week" title="Previous week"><IconLeft /></Link>
          <Link className="btn" href="/review">This week</Link>
          {week < thisWeek && <Link className="btn icon" href={`/review?week=${addDays(week, 7)}`} aria-label="Next week" title="Next week"><IconRight /></Link>}
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.owErrors} />
      {r.observations.length > 0 && (
        <Notice kind="info">
          <b>Observations</b>
          <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{r.observations.map((o) => <li key={o}>{o}</li>)}</ul>
        </Notice>
      )}

      <Card title="Training">
        <div className="grid cols-5">
          <div><div className="stat-label">Completed</div><div className="stat-value">{t.completed}<span className="unit">/ {t.planned} planned</span></div><div className="stat-sub">{t.unplanned} unplanned · {t.skipped} skipped</div></div>
          <div><div className="stat-label">Compliance</div><div className="stat-value">{t.compliancePct == null ? "—" : `${Math.round(t.compliancePct)}%`}</div><div className="stat-sub">{t.missed} missed</div></div>
          <div><div className="stat-label">Duration</div><div className="stat-value" style={{ fontSize: 22 }}>{fmtDuration(t.actualDurationMin)}</div><div className="stat-sub">planned {fmtDuration(t.plannedDurationMin)}</div></div>
          <div><div className="stat-label">Load</div><div className="stat-value">{fmt(t.actualLoad)}<span className="unit">AU</span></div><div className="stat-sub">planned {fmt(t.plannedLoad)} sRPE{t.unrated ? ` · ${t.unrated} unrated` : ""}</div></div>
          <div><div className="stat-label">Monotony · strain · ACWR</div><div className="stat-value" style={{ fontSize: 22 }}>{fmt(t.monotony, 2)}</div><div className="stat-sub">strain {fmt(t.strain)} · ACWR {fmt(t.acwrAtEnd, 2)}</div></div>
        </div>
        {t.sessions.length === 0 ? <div className="mt"><Empty title="No training recorded this week" /></div> : (
          <div className="grid cols-3 mt">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Sport</th><th className="num">Sessions</th><th className="num">Time</th><th className="num">Load</th></tr></thead>
                <tbody>{t.bySport.map((b) => <tr key={b.sport}><td>{isSportFamily(b.sport) ? SPORT_LABEL[b.sport] : b.sport}</td><td className="num">{b.sessions}</td><td className="num">{fmtDuration(b.durationMin)}</td><td className="num">{fmt(b.load)}</td></tr>)}</tbody>
              </table>
            </div>
            <div className="table-wrap span-2">
              <table className="t">
                <thead><tr><th>Day</th><th>Session</th><th className="num">Time</th><th className="num">RPE</th><th className="num">Load</th><th>Plan</th></tr></thead>
                <tbody>
                  {t.sessions.map((x) => (
                    <tr key={x.key}>
                      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(x.date, { weekday: "short" })}</td>
                      <td><Link href={`/history/session?key=${encodeURIComponent(x.key)}&date=${x.date}`}>{x.title}</Link><div className="small muted">{x.source}</div></td>
                      <td className="num">{fmtDuration(x.durationMin)}</td>
                      <td className="num">{x.rpe ?? "—"}</td>
                      <td className="num">{fmt(x.load)}</td>
                      <td className="small">{x.planned ?? <span className="muted">Unplanned</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Card>

      <div className="grid cols-3">
        <Card title="HRV" action={r.hrv.device && <SourceChip name={r.hrv.device.name} fallback={r.hrv.device.fallback} />} className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Week</th><th className="num">Nights</th><th className="num">Geo. mean</th><th className="num">ln mean</th><th className="num">CV ln</th></tr></thead>
              <tbody>{r.hrv.weeks.map((w) => (
                <tr key={w.weekStart} style={cur(w.weekStart)}><td>{wk(w.weekStart)}</td><td className="num">{w.n}</td><td className="num">{w.geoMeanMs != null ? `${fmt(w.geoMeanMs)} ms` : "—"}</td><td className="num">{fmt(w.meanLn, 2)}</td><td className="num">{w.cvPct != null ? `${fmt(w.cvPct, 1)}%` : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted" style={{ padding: "8px 16px 16px" }}>A falling weekly mean with a rising CV has accompanied maladaptation in case data (<a href={REFS.plews2012.url} target="_blank" rel="noreferrer">Plews et al. 2012</a>).</p>
        </Card>
        <Card title="Resting HR" action={r.rhr.device && <SourceChip name={r.rhr.device.name} fallback={r.rhr.device.fallback} />} className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Week</th><th className="num">Nights</th><th className="num">Mean ± SD</th></tr></thead>
              <tbody>{r.rhr.weeks.map((w) => (
                <tr key={w.weekStart} style={cur(w.weekStart)}><td>{wk(w.weekStart)}</td><td className="num">{w.n}</td><td className="num">{w.mean != null ? `${fmt(w.mean, 1)} ± ${fmt(w.sd, 1)} bpm` : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </Card>
        <Card title="Sleep" action={r.sleep.device && <SourceChip name={r.sleep.device.name} fallback={r.sleep.device.fallback} />} className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Week</th><th className="num">Asleep</th><th className="num">Bed / wake</th><th className="num">Midpoint SD</th></tr></thead>
              <tbody>{r.sleep.weeks.map((w) => (
                <tr key={w.weekStart} style={cur(w.weekStart)}><td>{wk(w.weekStart)}</td><td className="num">{fmtDuration(w.meanMin)}{w.sdMin != null && <div className="small muted">± {Math.round(w.sdMin)} min</div>}</td><td className="num">{w.meanBedtime ?? "—"} / {w.meanWake ?? "—"}</td><td className="num">{w.midpointSdMin != null ? `${Math.round(w.midpointSdMin)} min` : "—"}</td></tr>
              ))}</tbody>
            </table>
          </div>
          <p className="small muted" style={{ padding: "8px 16px 16px" }}>Midpoint SD = night-to-night variability of sleep timing (lower is more regular; see <a href={REFS.fischer2021.url} target="_blank" rel="noreferrer">Fischer et al. 2021</a> on regularity metrics).</p>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Wellness" hint={`answered ${r.wellness.answeredDays} of ${r.daysElapsed} days`} className="flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Item (0–100, higher = better)</th><th className="num">This week</th><th className="num">Previous weeks</th><th className="num">Change</th></tr></thead>
              <tbody>
                <tr><td><b>Composite</b></td><td className="num"><b>{fmt(r.wellness.weeks.at(-1)?.composite)}</b></td><td className="num">{fmt(avg(r.wellness.weeks.slice(0, -1).map((w) => w.composite)))}</td><td className="num">{delta(r.wellness.weeks.at(-1)?.composite ?? null, avg(r.wellness.weeks.slice(0, -1).map((w) => w.composite)))}</td></tr>
                {r.wellness.items.map((i) => <tr key={i.key}><td>{i.label}</td><td className="num">{fmt(i.thisWeek)}</td><td className="num">{fmt(i.priorWeeks)}</td><td className="num">{delta(i.thisWeek, i.priorWeeks)}</td></tr>)}
              </tbody>
            </table>
          </div>
        </Card>
        <Card title="Check-ins this week">
          {r.checkIns.length === 0 ? <Empty title="No weekly check-in yet" action={<Link className="btn sm" href="/wellness">Open questionnaires</Link>} /> : (
            <div className="stack">
              {r.checkIns.map((c) => (
                <div key={c.name + c.date}>
                  <h3>{c.name} <span className="small muted">· {fmtDate(c.date)}</span></h3>
                  <dl className="kv mt-sm">{c.answers.map((a) => <Fragment key={a.label}><dt>{a.label}</dt><dd>{a.value}</dd></Fragment>)}</dl>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function avg(xs: (number | null)[]): number | null {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function delta(a: number | null, b: number | null): string {
  if (a == null || b == null) return "—";
  const d = a - b;
  return `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(0)}`;
}

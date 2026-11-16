import Link from "next/link";
import { getCtx } from "@/lib/domain/context";
import { getReadiness } from "@/lib/domain/readiness";
import { listPlanSessions, matchPlan, plannedLoad } from "@/lib/domain/plan";
import { getTraining } from "@/lib/domain/training";
import { isDue, listDefs } from "@/lib/domain/questionnaires";
import { addDays, fmtDate, fmtDuration, fmtTime, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL, isSportFamily } from "@/lib/sports";
import { Card, Empty, SourceChip, fmt } from "@/components/ui";
import { NightStat, ReadinessCard } from "@/components/readiness";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { HrvChart, LoadCharts } from "@/components/trend-charts";

export default async function TodayPage() {
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const [r, plan, recent, defs] = await Promise.all([
    getReadiness(ctx, today),
    listPlanSessions(ctx.athlete.id, today, today),
    getTraining(ctx, addDays(today, -6), today),
    listDefs(ctx.athlete.id),
  ]);
  const due = (await Promise.all(defs.map(async (d) => ((await isDue(d, today, startOfWeek(today))) ? d : null)))).filter((d) => d != null);
  const { matches } = matchPlan(plan, recent.sessions.filter((s) => s.date === today));
  const hp = r.hrv.point;
  const shown = recent.sessions.filter((s) => !s.excluded);
  const hidden = recent.sessions.length - shown.length;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>{fmtDate(today, { weekday: "long", month: "long", day: "numeric" })}</h1>
          <p className="sub">Plan, last night&apos;s recovery and this morning&apos;s check-in for {ctx.athlete.name}.</p>
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.errors} />

      <div className="grid cols-3">
        <ReadinessCard r={r} compact />
        <Card title="Today's plan" action={<Link className="small" href="/plan">Open plan</Link>}>
          {matches.length === 0 ? (
            <Empty title="Nothing planned today">Rest day, or add a session on the plan calendar.</Empty>
          ) : (
            <div className="stack">
              {matches.map(({ plan: p, actual }) => (
                <div key={p.id} className="stack" style={{ gap: 2, paddingBottom: 8, borderBottom: "1px solid var(--line)" }}>
                  <div className="row between">
                    <b>{p.title}</b>
                    <span className={`pill ${actual ? "ok" : p.skipped ? "nodata" : "watch"}`}>{actual ? "Done" : p.skipped ? "Skipped" : "To do"}</span>
                  </div>
                  <span className="small ink2">
                    {isSportFamily(p.sport) ? SPORT_LABEL[p.sport] : p.sport}
                    {p.planned_duration_min ? ` · ${fmtDuration(p.planned_duration_min)}` : ""}
                    {p.intensity ? ` · ${p.intensity}` : ""}
                    {plannedLoad(p) != null ? ` · ${fmt(plannedLoad(p))} AU` : ""}
                  </span>
                  {p.description && <span className="small muted">{p.description}</span>}
                  {actual && <span className="small">Done: {fmtDuration(actual.durationMin)} · <SourceChip name={actual.sourceLabel} /></span>}
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Check-in" action={<Link className="small" href="/wellness">All forms</Link>}>
          {due.length ? (
            <div className="stack">
              {due.map((d) => (
                <Link key={d.id} href={`/wellness/${d.slug}`} className="btn primary">Answer {d.name}</Link>
              ))}
              <p className="small muted">Answer before training so it reflects how you woke up.</p>
            </div>
          ) : r.wellness.today ? (
            <div className="stack">
              <div className="stat-value">{fmt(r.wellness.today.composite)}<span className="unit">/100</span></div>
              <span className="small ink2">Wellness composite{r.wellness.z?.z != null ? ` · z ${r.wellness.z.z.toFixed(1)} vs ${ctx.settings.baselines.windowDays}-day baseline` : ""}</span>
              {r.wellness.lowItems.length > 0 && <span className="small">Low today: {r.wellness.lowItems.map((i) => i.key.replace(/_/g, " ")).join(", ")}</span>}
            </div>
          ) : (
            <Empty title="All forms answered" />
          )}
        </Card>
      </div>

      {ctx.ow && (
        <>
          <h2>Last night</h2>
          <div className="grid cols-5">
            <NightStat ctx={ctx} rows={r.nightly} date={today} metric="sleep" label="Sleep" unit="" />
            <NightStat ctx={ctx} rows={r.nightly} date={today} metric="hrv" label="HRV (RMSSD)" unit="ms">
              {hp?.rollingMs != null && (
                <span className="small ink2">
                  7-day {fmt(hp.rollingMs)} ms (ln {hp.rollingLn!.toFixed(2)})
                  {hp.swcLow != null && ` · normal ${fmt(Math.exp(hp.swcLow))}–${fmt(Math.exp(hp.swcHigh!))}`}
                </span>
              )}
            </NightStat>
            <NightStat ctx={ctx} rows={r.nightly} date={today} metric="rhr" label="Resting HR" unit="bpm">
              {r.rhr.z?.mean != null && <span className="small ink2">baseline {fmt(r.rhr.z.mean)} bpm</span>}
            </NightStat>
            <NightStat ctx={ctx} rows={r.nightly} date={today} metric="respiratory_rate" label="Respiratory rate" unit="br/min" digits={1} />
            <NightStat ctx={ctx} rows={r.nightly} date={today} metric="spo2" label="SpO₂" unit="%" digits={1} />
          </div>
          <div className="grid cols-2">
            <Card title="HRV trend" hint={r.hrv.device ? undefined : "no HRV device yet"} action={r.hrv.device && <SourceChip name={r.hrv.device.name} fallback={r.hrv.device.fallback} />}>
              <HrvChart series={r.hrv.series} />
            </Card>
            <Card title="Training load" hint={`${ctx.settings.load.method.toUpperCase()} · ${ctx.settings.load.acwrModel.toUpperCase()} ACWR`}>
              <LoadCharts series={r.load.series} low={ctx.settings.readiness.acwrLow} high={ctx.settings.readiness.acwrHigh} compact />
              {r.load.note && <p className="small muted mt-sm">{r.load.note}</p>}
            </Card>
          </div>
        </>
      )}

      <Card title="Last 7 days" hint={hidden ? `${hidden} non-training recording${hidden === 1 ? "" : "s"} hidden` : undefined} action={<Link className="small" href="/history">History</Link>} className="flush">
        {shown.length === 0 ? (
          <Empty title="No sessions in the last 7 days" action={<Link className="btn sm" href="/history#log">Log a session</Link>} />
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Date</th><th>Session</th><th className="num">Duration</th><th className="num">Avg HR</th><th className="num">RPE</th><th className="num">Load</th><th>Source</th></tr></thead>
              <tbody>
                {[...shown].reverse().map((s) => (
                  <tr key={s.key}>
                    <td style={{ whiteSpace: "nowrap" }}>{fmtDate(s.date)}{s.start && <div className="small muted">{fmtTime(s.start, tz)}</div>}</td>
                    <td>{s.title}</td>
                    <td className="num">{fmtDuration(s.durationMin)}</td>
                    <td className="num">{fmt(s.avgHr)}</td>
                    <td className="num">{s.rpe ?? <Link href={`/history/session?key=${encodeURIComponent(s.key)}`}>Rate</Link>}</td>
                    <td className="num">{s.load != null ? `${fmt(s.load)}${s.loadMethod === "trimp" ? " T" : ""}` : "—"}</td>
                    <td><SourceChip name={s.sourceLabel} />{s.recordings.length > 1 && <span className="small muted"> +{s.recordings.length - 1}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getTraining, type TrainingSession } from "@/lib/domain/training";
import { listPlanSessions, matchPlan, plannedLoad } from "@/lib/domain/plan";
import { addDays, fmtDate, fmtDuration, fmtTime, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL } from "@/lib/sports";
import { Card, Empty, Notice, SourceChip, fmt } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { TimeChart } from "@/components/charts";
import { RateSelect } from "@/components/rate-select";
import { ManualSessionForm } from "@/components/session-form";
import { rateSession } from "../actions";

export const metadata: Metadata = { title: "History" };

const WINDOWS = [4, 8, 12, 26];

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ weeks?: string; error?: string; saved?: string; show?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const weeks = WINDOWS.includes(Number(sp.weeks)) ? Number(sp.weeks) : 8;
  const showExcluded = sp.show === "excluded";
  const start = addDays(startOfWeek(today), -7 * (weeks - 1));
  const end = addDays(startOfWeek(today), 6);
  const [training, plan] = await Promise.all([getTraining(ctx, start, today), listPlanSessions(ctx.athlete.id, start, end)]);
  const { matches, unplanned } = matchPlan(plan, training.sessions);
  const matchedKeys = new Map(matches.filter((m) => m.actual).map((m) => [m.actual!.key, m]));

  type Wk = { start: string; planned: number; done: number; skipped: number; pDur: number; aDur: number; pLoad: number; aLoad: number; unplanned: number };
  const wk = new Map<string, Wk>();
  for (let w = start; w <= end; w = addDays(w, 7)) wk.set(w, { start: w, planned: 0, done: 0, skipped: 0, pDur: 0, aDur: 0, pLoad: 0, aLoad: 0, unplanned: 0 });
  for (const m of matches) {
    const w = wk.get(startOfWeek(m.plan.date))!;
    w.planned++;
    if (m.plan.skipped) w.skipped++;
    if (m.actual) w.done++;
    w.pDur += m.plan.planned_duration_min ?? 0;
    w.pLoad += plannedLoad(m.plan) ?? 0;
  }
  for (const s of training.sessions) {
    if (s.excluded) continue;
    const w = wk.get(startOfWeek(s.date));
    if (!w) continue;
    w.aDur += s.durationMin ?? 0;
    w.aLoad += s.load ?? 0;
  }
  for (const u of unplanned) { const w = wk.get(startOfWeek(u.date)); if (w) w.unplanned++; }
  const weekRows = [...wk.values()];
  const excludedCount = training.sessions.filter((s) => s.excluded).length;
  const visible = training.sessions.filter((s) => showExcluded || !s.excluded).reverse();
  const planOptions = plan.filter((p) => p.date <= today && p.date >= addDays(today, -14)).map((p) => ({ id: p.id, label: `${fmtDate(p.date)} · ${p.title}` }));
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>Training history</h1>
          <p className="sub">Plan vs actual, every device session and every manual log. Sessions recorded by several devices are counted once.</p>
        </div>
        <div className="seg">
          {WINDOWS.map((w) => <Link key={w} href={`/history?weeks=${w}`} className={w === weeks ? "on" : ""}>{w} wk</Link>)}
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={[training.owError]} />
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}

      <Card title="Planned vs delivered load" hint={`weekly sRPE AU (${ctx.settings.load.method === "srpe" ? "actual from rated sessions" : `actual in ${ctx.settings.load.method.toUpperCase()}: not directly comparable to planned sRPE`})`}>
        <TimeChart ariaLabel="Weekly planned versus actual load"
          series={[
            { id: "p", label: "Planned", color: "var(--s1)", kind: "bar", points: weekRows.map((w) => [dx(w.start), w.pLoad || null]) },
            { id: "a", label: "Delivered", color: "var(--s2)", kind: "bar", points: weekRows.map((w) => [dx(w.start), w.aLoad || null]) },
          ]} height={200} />
      </Card>

      <Card title="Weeks" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Week of</th><th className="num">Planned</th><th className="num">Completed</th><th className="num">Compliance</th><th className="num">Unplanned</th><th className="num">Duration plan / actual</th><th className="num">Load plan / actual</th></tr></thead>
            <tbody>
              {[...weekRows].reverse().map((w) => {
                const due = w.planned - w.skipped;
                return (
                  <tr key={w.start}>
                    <td>{fmtDate(w.start, { month: "short", day: "numeric" })}</td>
                    <td className="num">{w.planned}</td>
                    <td className="num">{w.done}</td>
                    <td className="num">{due > 0 ? `${Math.round((w.done / due) * 100)}%` : "—"}</td>
                    <td className="num">{w.unplanned}</td>
                    <td className="num">{fmtDuration(w.pDur)} / {fmtDuration(w.aDur)}</td>
                    <td className="num">{fmt(w.pLoad)} / {fmt(w.aLoad)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Sessions" className="flush"
        hint={excludedCount ? <Link href={showExcluded ? `/history?weeks=${weeks}` : `/history?weeks=${weeks}&show=excluded`}>{showExcluded ? "Hide" : "Show"} {excludedCount} excluded</Link> : undefined}>
        {visible.length === 0 ? (
          <Empty title="No sessions in this window">Device workouts appear here automatically once Open Wearables has them. You can also log one below.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Date</th><th>Session</th><th className="num">Duration</th><th className="num">Avg HR</th><th className="num">RPE</th><th className="num">Load</th><th>Plan</th><th>Source</th></tr></thead>
              <tbody>
                {visible.map((s) => <SessionRow key={s.key} s={s} tz={tz} match={matchedKeys.get(s.key)?.plan.title ?? null} />)}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card title="Log a session" hint="for training no device recorded">
        <div id="log" />
        {sp.saved && <p className="small" style={{ color: "var(--good)", marginBottom: 8 }}>Session saved.</p>}
        <ManualSessionForm today={today} back={`/history?weeks=${weeks}`} planOptions={planOptions} />
      </Card>
    </div>
  );
}

function SessionRow({ s, tz, match }: { s: TrainingSession; tz: string; match: string | null }) {
  const href = `/history/session?key=${encodeURIComponent(s.key)}&date=${s.date}`;
  return (
    <tr style={s.excluded ? { opacity: 0.6 } : undefined}>
      <td style={{ whiteSpace: "nowrap" }}>{fmtDate(s.date)}{s.start && <div className="small muted">{fmtTime(s.start, tz)}</div>}</td>
      <td>
        <Link href={href}>{s.title}</Link>
        <div className="small muted">{SPORT_LABEL[s.family]}{s.distanceKm ? ` · ${fmt(s.distanceKm, 1)} km` : ""}{s.excluded ? ` · ${s.excluded}` : ""}</div>
      </td>
      <td className="num">{fmtDuration(s.durationMin)}</td>
      <td className="num">{fmt(s.avgHr)}</td>
      <td className="num">
        {s.excluded ? "—" : (
          <RateSelect action={rateSession} value={s.rpe} label={`RPE for ${s.title}`}
            hidden={{ key: s.key, date: s.date, start_time: s.start ?? "", sport: s.family, duration_min: String(s.durationMin ?? 0), back: "/history" }} />
        )}
      </td>
      <td className="num">{s.load != null ? fmt(s.load) : "—"}{s.loadMethod === "trimp" && <span className="small muted"> TRIMP</span>}</td>
      <td>{match ? <span className="small">{match}</span> : <span className="small muted">Unplanned</span>}</td>
      <td><SourceChip name={s.sourceLabel} />{s.recordings.length > 1 && <span className="small muted"> +{s.recordings.length - 1}</span>}</td>
    </tr>
  );
}

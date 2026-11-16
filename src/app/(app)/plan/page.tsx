import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { listPhases, listPlanSessions, matchPlan, plannedLoad, type PlanSession } from "@/lib/domain/plan";
import { getTraining } from "@/lib/domain/training";
import { addDays, addMonths, endOfMonth, fmtDate, fmtDuration, isISODate, startOfMonth, startOfWeek, todayIn } from "@/lib/dates";
import { Card, Notice, fmt } from "@/components/ui";
import { IconLeft, IconPlus, IconRight } from "@/components/icons";
import { PlanSessionForm } from "@/components/plan-form";
import { copyPlanWeek } from "../actions";

export const metadata: Metadata = { title: "Plan" };

const PHASE_COLOR: Record<string, string> = {
  base: "var(--s1)", build: "var(--s2)", peak: "var(--s8)", taper: "var(--s4)", race: "var(--s7)", recovery: "var(--s3)", transition: "var(--line-strong)",
};

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ month?: string; new?: string; edit?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : startOfMonth(today);
  const gridStart = startOfWeek(month);
  const gridEnd = addDays(startOfWeek(endOfMonth(month)), 6);
  const [phases, plan, training] = await Promise.all([
    listPhases(ctx.athlete.id, gridStart, gridEnd),
    listPlanSessions(ctx.athlete.id, gridStart, gridEnd),
    getTraining(ctx, gridStart, gridEnd < today ? gridEnd : today),
  ]);
  const { matches, unplanned } = matchPlan(plan, training.sessions);
  const status = new Map(matches.map((m) => [m.plan.id, m.actual ? "done" : m.plan.skipped ? "skipped" : m.plan.date < today ? "missed" : "planned"]));
  const editing = sp.edit ? plan.find((p) => p.id === Number(sp.edit)) : undefined;
  const newDate = isISODate(sp.new) ? sp.new : null;
  const ym = month.slice(0, 7);
  const back = `/plan?month=${ym}`;

  const days: string[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
  const byDay = new Map<string, PlanSession[]>();
  for (const p of plan) byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const extraByDay = new Map<string, typeof unplanned>();
  for (const u of unplanned) if (!u.excluded) extraByDay.set(u.date, [...(extraByDay.get(u.date) ?? []), u]);
  const monthPlanned = plan.filter((p) => p.date.startsWith(ym));
  const monthLoad = monthPlanned.reduce((a, p) => a + (plannedLoad(p) ?? 0), 0);
  const monthDur = monthPlanned.reduce((a, p) => a + (p.planned_duration_min ?? 0), 0);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>{fmtDate(month, { month: "long", year: "numeric" })}</h1>
          <p className="sub">{monthPlanned.length} planned sessions · {fmtDuration(monthDur)} · {fmt(monthLoad)} AU planned sRPE</p>
        </div>
        <div className="row">
          <Link className="btn icon" href={`/plan?month=${addMonths(month, -1).slice(0, 7)}`} aria-label="Previous month" title="Previous month"><IconLeft /></Link>
          <Link className="btn" href="/plan">Today</Link>
          <Link className="btn icon" href={`/plan?month=${addMonths(month, 1).slice(0, 7)}`} aria-label="Next month" title="Next month"><IconRight /></Link>
          <Link className="btn" href="/plan/phases">Phases</Link>
          <Link className="btn primary" href={`/plan?month=${ym}&new=${month <= today && today <= endOfMonth(month) ? today : month}#form`}><IconPlus />Add session</Link>
        </div>
      </div>
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}

      <div className="cal" role="grid" aria-label="Plan calendar">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="cal-h">{d}</div>)}
        {days.map((d) => {
          const ph = phases.find((p) => d >= p.start_date && d <= p.end_date);
          const showPhase = ph && (d === ph.start_date || d === startOfWeek(d));
          return (
            <div key={d} className={`cal-d${d.slice(0, 7) !== ym ? " out" : ""}${d === today ? " today" : ""}`} role="gridcell">
              <div className="cal-n">
                <span>{Number(d.slice(8))}<span className="small muted" style={{ fontWeight: 400 }}>{" "}{fmtDate(d, { weekday: "short" }).slice(0, 3)}</span></span>
                <Link href={`/plan?month=${ym}&new=${d}#form`} className="muted" aria-label={`Add session on ${fmtDate(d)}`} title="Add session"><IconPlus size={14} /></Link>
              </div>
              {showPhase && <div className="cal-phase" style={{ borderLeftColor: PHASE_COLOR[ph.kind] }} title={ph.goal ?? ph.name}>{ph.name}</div>}
              {(byDay.get(d) ?? []).map((p) => (
                <Link key={p.id} href={`/plan?month=${ym}&edit=${p.id}#form`} className={`sess ${status.get(p.id)}`} title={`${p.title}${p.intensity ? ` · ${p.intensity}` : ""} — ${status.get(p.id)}`}>
                  <b>{p.title}</b>
                  {(p.planned_duration_min || p.intensity) && <div className="muted">{[p.planned_duration_min ? fmtDuration(p.planned_duration_min) : null, p.intensity].filter(Boolean).join(" · ")}</div>}
                </Link>
              ))}
              {(extraByDay.get(d) ?? []).map((u) => (
                <Link key={u.key} href={`/history/session?key=${encodeURIComponent(u.key)}&date=${u.date}`} className="sess extra" title="Done but not planned">
                  {u.title} · {fmtDuration(u.durationMin)}
                </Link>
              ))}
            </div>
          );
        })}
      </div>
      <div className="row small muted" style={{ gap: 16 }}>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--accent)" }} />Planned</span>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--good)" }} />Done</span>
        <span className="row" style={{ gap: 6 }}><span className="dot" style={{ background: "var(--bad)" }} />Missed</span>
        <span>Dashed: done but not planned</span>
      </div>

      <div className="grid cols-2" id="form">
        <Card title={editing ? `Edit: ${editing.title}` : `New session${newDate ? ` · ${fmtDate(newDate)}` : ""}`}>
          <PlanSessionForm key={editing?.id ?? newDate ?? "new"} date={newDate ?? today} back={back} existing={editing} />
        </Card>
        <Card title="Copy a week forward" hint="repeat a microcycle">
          <form action={copyPlanWeek} className="stack">
            <input type="hidden" name="back" value={back} />
            <div className="form-grid">
              <label className="field">Week starting (Monday)<input type="date" name="week_start" defaultValue={startOfWeek(today)} required /></label>
              <label className="field">Weeks ahead<input type="number" name="weeks" min={1} max={12} defaultValue={1} /></label>
            </div>
            <p className="small muted">Copies every session in that week to the same weekday N weeks later. Existing sessions there are kept.</p>
            <div className="row"><button className="btn" type="submit">Copy week</button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}

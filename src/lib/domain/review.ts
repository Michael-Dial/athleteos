import "server-only";
import { addDays, startOfWeek, todayIn, type ISODate } from "../dates";
import { finite, mean, sd } from "../stats/basic";
import { acwr, monotonyStrain } from "../stats/load";
import { clockFromNoon, midpointFromNoon, minutesFromNoon, timingStats } from "../stats/sleep-timing";
import type { AppCtx } from "./context";
import { baselineDevice, FALLBACK_WINDOW_DAYS, getNightly, type NightRow } from "./nightly";
import { listPlanSessions, matchPlan, plannedLoad } from "./plan";
import { listDefs, listResponses, listWellness } from "./questionnaires";
import { dailyLoad, getTraining } from "./training";

type Dev = { key: string; name: string; fallback: boolean } | null;

export interface WeeklyReview {
  weekStart: ISODate;
  weekEnd: ISODate;
  daysElapsed: number;
  training: {
    planned: number; completed: number; skipped: number; missed: number; unplanned: number; compliancePct: number | null;
    plannedDurationMin: number; actualDurationMin: number; plannedLoad: number; actualLoad: number;
    unrated: number; loadMethods: string[];
    bySport: { sport: string; sessions: number; durationMin: number; load: number }[];
    monotony: number | null; strain: number | null; acwrAtEnd: number | null;
    sessions: { key: string; date: ISODate; title: string; sport: string; durationMin: number | null; rpe: number | null; load: number | null; planned: string | null; source: string }[];
  };
  hrv: { device: Dev; weeks: { weekStart: ISODate; n: number; meanLn: number | null; geoMeanMs: number | null; cvPct: number | null }[] };
  rhr: { device: Dev; weeks: { weekStart: ISODate; n: number; mean: number | null; sd: number | null }[] };
  sleep: {
    device: Dev;
    weeks: { weekStart: ISODate; n: number; meanMin: number | null; sdMin: number | null; midpointSdMin: number | null; meanBedtime: string | null; meanWake: string | null }[];
  };
  wellness: {
    answeredDays: number;
    weeks: { weekStart: ISODate; n: number; composite: number | null }[];
    items: { key: string; label: string; thisWeek: number | null; priorWeeks: number | null }[];
  };
  checkIns: { name: string; date: ISODate; answers: { label: string; value: string }[] }[];
  observations: string[];
  owErrors: string[];
}

function weekRows<T>(weeks: ISODate[], rows: NightRow[], key: string | undefined, f: (mine: NightRow[]) => T): ({ weekStart: ISODate } & T)[] {
  return weeks.map((w) => ({ weekStart: w, ...f(rows.filter((r) => r.key === key && r.date >= w && r.date <= addDays(w, 6))) }));
}

/** One Monday-start week next to the preceding weeks, every metric from one device. */
export async function getWeeklyReview(ctx: AppCtx, weekStartIn: ISODate): Promise<WeeklyReview> {
  const s = ctx.settings;
  const weekStart = startOfWeek(weekStartIn);
  const weekEnd = addDays(weekStart, 6);
  const today = todayIn(s.timezone);
  const last = weekEnd < today ? weekEnd : today;
  const daysElapsed = Math.max(0, Math.min(7, Math.round((Date.parse(last) - Date.parse(weekStart)) / 86400000) + 1));
  const nW = s.review.comparisonWeeks;
  const weeks = Array.from({ length: nW + 1 }, (_, i) => addDays(weekStart, -7 * (nW - i)));
  // Load enough nights for the fixed device-fallback window, not just the weeks shown.
  const histStart = [weeks[0], addDays(last, -(FALLBACK_WINDOW_DAYS - 1))].sort()[0];
  const loadStart = addDays(weekStart, -s.load.chronicDays * 3);

  const [nightly, training, plan, wellness, defs] = await Promise.all([
    getNightly(ctx, histStart, weekEnd),
    getTraining(ctx, loadStart, last),
    listPlanSessions(ctx.athlete.id, weekStart, weekEnd),
    listWellness(ctx.athlete.id, weeks[0], weekEnd),
    listDefs(ctx.athlete.id, true),
  ]);

  // ---- training
  const weekSessions = training.sessions.filter((x) => x.date >= weekStart && x.date <= weekEnd && !x.excluded);
  const { matches, unplanned } = matchPlan(plan, weekSessions);
  const status = (m: (typeof matches)[number]) => (m.actual ? "done" : m.plan.skipped ? "skipped" : m.plan.date < today ? "missed" : "planned");
  const completed = matches.filter((m) => status(m) === "done").length;
  const skipped = matches.filter((m) => status(m) === "skipped").length;
  const missed = matches.filter((m) => status(m) === "missed").length;
  const due = completed + missed;
  const bySport = new Map<string, { sessions: number; durationMin: number; load: number }>();
  for (const x of weekSessions) {
    const b = bySport.get(x.family) ?? { sessions: 0, durationMin: 0, load: 0 };
    b.sessions++; b.durationMin += x.durationMin ?? 0; b.load += x.load ?? 0;
    bySport.set(x.family, b);
  }
  const { byDate, methods } = dailyLoad(training.sessions);
  const ms = monotonyStrain(byDate, last);
  const ac = acwr(byDate, loadStart, last, last, { acuteDays: s.load.acuteDays, chronicDays: s.load.chronicDays, model: s.load.acwrModel }).at(-1);
  const plannedFor = new Map(matches.filter((m) => m.actual).map((m) => [m.actual!.key, m.plan.title]));

  // ---- overnight metrics, one device each
  const rows = nightly.rows;
  // Anchor on the last elapsed day (not a future week end) so the device
  // choice matches Today, Readiness and Coverage.
  const hDev = baselineDevice(ctx, rows, "hrv", last, weekStart);
  const rDev = baselineDevice(ctx, rows, "rhr", last, weekStart);
  const sDev = baselineDevice(ctx, rows, "sleep", last, weekStart);
  const hrvWeeks = weekRows(weeks, rows, hDev?.key, (mine) => {
    const ln = finite(mine.map((r) => r.hrv)).filter((v) => v > 0).map(Math.log);
    const m = mean(ln), d = sd(ln);
    return { n: ln.length, meanLn: m, geoMeanMs: m != null ? Math.exp(m) : null, cvPct: m && d != null ? (d / m) * 100 : null };
  });
  const rhrWeeks = weekRows(weeks, rows, rDev?.key, (mine) => {
    const v = finite(mine.map((r) => r.rhr));
    return { n: v.length, mean: mean(v), sd: sd(v) };
  });
  const sleepWeeks = weekRows(weeks, rows, sDev?.key, (mine) => {
    const dur = finite(mine.map((r) => r.sleepMin));
    const timed = mine.filter((r) => r.start && r.end);
    const mids = timed.map((r) => midpointFromNoon(r.start!, r.end!, r.zoneOffset));
    const beds = timed.map((r) => minutesFromNoon(r.start!, r.zoneOffset));
    // Wake times sit after midnight, so average them on a midnight-anchored scale.
    const wakes = timed.map((r) => (minutesFromNoon(r.end!, r.zoneOffset) + 720) % 1440);
    const wm = mean(wakes);
    return {
      n: dur.length, meanMin: mean(dur), sdMin: sd(dur), midpointSdMin: timingStats(mids).sdMin,
      meanBedtime: clockFromNoon(mean(beds)), meanWake: wm != null ? clockFromNoon((wm + 720) % 1440) : null,
    };
  });

  // ---- wellness
  const wDef = defs.find((d) => d.kind === "wellness" && d.active);
  const wellWeeks = weeks.map((w) => {
    const v = wellness.filter((x) => x.date >= w && x.date <= addDays(w, 6)).map((x) => Number(x.composite));
    return { weekStart: w, n: v.length, composite: mean(v) };
  });
  const thisWeekWell = wellness.filter((x) => x.date >= weekStart && x.date <= weekEnd);
  const priorWell = wellness.filter((x) => x.date < weekStart);
  const items = (wDef?.items ?? []).filter((i) => i.type === "scale" || i.wellness).map((i) => ({
    key: i.key,
    label: i.label,
    thisWeek: mean(finite(thisWeekWell.map((x) => (x.item_scores[i.key] != null ? x.item_scores[i.key] * 100 : null)))),
    priorWeeks: mean(finite(priorWell.map((x) => (x.item_scores[i.key] != null ? x.item_scores[i.key] * 100 : null)))),
  }));

  // ---- weekly / ad-hoc forms answered this week
  const checkIns: WeeklyReview["checkIns"] = [];
  for (const d of defs.filter((d) => d.schedule !== "daily")) {
    for (const r of await listResponses(ctx.athlete.id, d.id, weekStart, weekEnd)) {
      checkIns.push({
        name: d.name, date: r.date,
        answers: r.items_snapshot.filter((it) => r.answers[it.key] != null && r.answers[it.key] !== "")
          .map((it) => ({ label: it.label, value: `${r.answers[it.key]}${it.unit ? ` ${it.unit}` : ""}` })),
      });
    }
  }

  // ---- factual observations (no verdicts)
  const obs: string[] = [];
  const cur = hrvWeeks.at(-1)!, prev = hrvWeeks.slice(0, -1).filter((w) => w.meanLn != null);
  if (cur.meanLn != null && prev.length) {
    const pm = mean(prev.map((w) => w.meanLn!))!;
    const pcv = mean(finite(prev.map((w) => w.cvPct)));
    if (cur.meanLn < pm && pcv != null && cur.cvPct != null && cur.cvPct > pcv) {
      obs.push(`HRV: weekly lnRMSSD mean fell (${cur.meanLn.toFixed(2)} vs ${pm.toFixed(2)}) while its CV rose (${cur.cvPct.toFixed(1)}% vs ${pcv.toFixed(1)}%) relative to the previous ${prev.length} weeks.`);
    }
  }
  if (due > 0 && (completed / due) * 100 < s.review.complianceFlagPct) obs.push(`Compliance ${Math.round((completed / due) * 100)}%: ${missed} planned session${missed === 1 ? "" : "s"} missed.`);
  if (ms.monotony != null && ms.monotony > s.review.monotonyFlag) obs.push(`Training monotony ${ms.monotony.toFixed(2)} (above ${s.review.monotonyFlag}): little day-to-day variation in load.`);
  const unrated = weekSessions.filter((x) => x.load == null).length;
  if (unrated) obs.push(`${unrated} session${unrated === 1 ? "" : "s"} this week ${unrated === 1 ? "has" : "have"} no load yet (rate RPE on History).`);
  const sw = sleepWeeks.at(-1)!;
  if (sw.meanMin != null && sw.meanMin < s.readiness.sleepTargetMin) obs.push(`Average sleep ${Math.round(sw.meanMin)} min, ${Math.round(s.readiness.sleepTargetMin - sw.meanMin)} min under the target.`);

  return {
    weekStart, weekEnd, daysElapsed,
    training: {
      planned: plan.length, completed, skipped, missed, unplanned: unplanned.length, compliancePct: due ? (completed / due) * 100 : null,
      plannedDurationMin: plan.reduce((a, p) => a + (p.planned_duration_min ?? 0), 0),
      actualDurationMin: weekSessions.reduce((a, x) => a + (x.durationMin ?? 0), 0),
      plannedLoad: plan.reduce((a, p) => a + (plannedLoad(p) ?? 0), 0),
      actualLoad: weekSessions.reduce((a, x) => a + (x.load ?? 0), 0),
      unrated, loadMethods: [...methods],
      bySport: [...bySport.entries()].map(([sport, b]) => ({ sport, ...b })).sort((a, b) => b.durationMin - a.durationMin),
      monotony: ms.monotony, strain: ms.strain, acwrAtEnd: ac?.acwr ?? null,
      sessions: weekSessions.map((x) => ({ key: x.key, date: x.date, title: x.title, sport: x.family, durationMin: x.durationMin, rpe: x.rpe, load: x.load, planned: plannedFor.get(x.key) ?? null, source: x.sourceLabel })),
    },
    hrv: { device: hDev, weeks: hrvWeeks },
    rhr: { device: rDev, weeks: rhrWeeks },
    sleep: { device: sDev, weeks: sleepWeeks },
    wellness: { answeredDays: thisWeekWell.length, weeks: wellWeeks, items },
    checkIns,
    observations: obs,
    owErrors: [nightly.owError, training.owError].filter((e): e is string => !!e),
  };
}

import "server-only";
import { q } from "../db";
import { addDays, localDateWithOffset, type ISODate } from "../dates";
import { getWorkouts } from "../ow/api";
import type { OwWorkout } from "../ow/types";
import { clusterByOverlap } from "../stats/cluster";
import { banisterTrimp, srpe } from "../stats/load";
import { deviceName, rankBySource } from "../stats/sources";
import { familyOf, prettyType, type SportFamily } from "../sports";
import { deviceKey } from "../stats/sources";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";

export interface ManualSession {
  id: number;
  date: ISODate;
  start_time: string | null;
  sport: string;
  title: string | null;
  duration_min: number;
  distance_km: number | null;
  rpe: number | null;
  ow_workout_id: string | null;
  plan_session_id: number | null;
  notes: string | null;
  excluded: boolean;
}

export type LoadMethod = "srpe" | "trimp" | "duration";

export interface TrainingSession {
  key: string; // "ow:<primary id>" or "manual:<id>"
  date: ISODate;
  start: string | null;
  family: SportFamily;
  type: string;
  title: string;
  durationMin: number | null;
  distanceKm: number | null;
  avgHr: number | null;
  maxHr: number | null;
  rpe: number | null;
  load: number | null;
  loadMethod: LoadMethod | null;
  /** Primary recording (device-priority choice) and every other device's copy. */
  primary: OwWorkout | null;
  recordings: OwWorkout[];
  sourceLabel: string;
  annotation: ManualSession | null;
  manual: ManualSession | null;
  /** Why this recording is left out of load and plan matching, if it is. */
  excluded: string | null;
}

export async function listManual(athleteId: number, start: ISODate, end: ISODate): Promise<ManualSession[]> {
  return q<ManualSession>(
    `SELECT id, date, start_time, sport, title, duration_min, distance_km, rpe, ow_workout_id, plan_session_id, notes, excluded
     FROM manual_session WHERE athlete_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, start_time NULLS LAST, id`,
    [athleteId, start, end],
  );
}

function computeLoad(
  ctx: AppCtx,
  durationMin: number | null,
  rpe: number | null,
  avgHr: number | null,
): { load: number | null; method: LoadMethod | null } {
  const L = ctx.settings.load;
  if (durationMin == null || durationMin <= 0) return { load: null, method: null };
  const trimp = () => (avgHr ? banisterTrimp(durationMin, avgHr, L.hrRest, L.hrMax, L.trimpSex) : null);
  if (L.method === "duration") return { load: durationMin, method: "duration" };
  if (L.method === "trimp") {
    const t = trimp();
    return t != null ? { load: t, method: "trimp" } : { load: null, method: null };
  }
  if (rpe != null) return { load: srpe(rpe, durationMin), method: "srpe" };
  if (L.trimpFallback) {
    const t = trimp();
    if (t != null) return { load: t, method: "trimp" };
  }
  return { load: null, method: null };
}

export interface TrainingResult {
  sessions: TrainingSession[];
  owError: string | null;
}

/**
 * Every training session in [start, end] (athlete-local dates): device
 * workouts grouped across devices, plus sessions logged by hand.
 */
export async function getTraining(ctx: AppCtx, start: ISODate, end: ISODate): Promise<TrainingResult> {
  const tz = ctx.settings.timezone;
  const manualAll = await listManual(ctx.athlete.id, start, end);
  // Annotations are keyed by workout id and may sit on a different local date
  // than the query window edge, so fetch them by id rather than by date.
  const annotations = await q<ManualSession>(
    `SELECT id, date, start_time, sport, title, duration_min, distance_km, rpe, ow_workout_id, plan_session_id, notes, excluded
     FROM manual_session WHERE athlete_id = $1 AND ow_workout_id IS NOT NULL AND date BETWEEN $2 AND $3`,
    [ctx.athlete.id, addDays(start, -1), addDays(end, 1)],
  );
  const annByWorkout = new Map(annotations.map((a) => [a.ow_workout_id!, a]));

  let workouts: OwWorkout[] = [];
  let owError: string | null = null;
  if (ctx.ow) {
    try {
      // OW date-only bounds are UTC days; pad a day each side and filter by local date.
      workouts = await getWorkouts(ctx.ow, addDays(start, -1), addDays(end, 1));
    } catch (e) {
      owError = errorMessage(e);
    }
  }

  const sessions: TrainingSession[] = [];
  const priority = ctx.settings.devicePriority.workouts ?? [];
  const groups = clusterByOverlap(workouts, (w) => ({ start: Date.parse(w.start_time), end: Date.parse(w.end_time) }), ctx.settings.training.sameSessionOverlap);
  for (const group of groups) {
    const ranked = rankBySource(group, (w) => w.source, priority);
    const p = ranked.primary!;
    const date = localDateWithOffset(p.start_time, p.zone_offset, tz);
    if (date < start || date > end) continue;
    const annotation = group.map((w) => annByWorkout.get(w.id)).find(Boolean) ?? null;
    const durationMin = p.duration_seconds != null ? p.duration_seconds / 60 : (Date.parse(p.end_time) - Date.parse(p.start_time)) / 60000;
    const rpe = annotation?.rpe ?? null;
    const T = ctx.settings.training;
    const excluded = annotation?.excluded
      ? "Excluded by you"
      : T.excludeDevices.includes(deviceKey(p.source))
        ? "Device excluded in settings"
        : T.excludeTypes.includes(p.type)
          ? "Type excluded in settings"
          : durationMin < T.minDurationMin
            ? `Shorter than ${T.minDurationMin} min`
            : durationMin > T.maxDurationHours * 60
              ? `Longer than ${T.maxDurationHours} h (likely not a workout)`
              : null;
    const { load, method } = excluded ? { load: null, method: null } : computeLoad(ctx, durationMin, rpe, p.avg_heart_rate_bpm);
    sessions.push({
      key: `ow:${p.id}`,
      date,
      start: p.start_time,
      family: familyOf(p.type),
      type: p.type,
      title: annotation?.title || p.name || prettyType(p.type),
      durationMin,
      distanceKm: p.distance_meters != null ? p.distance_meters / 1000 : null,
      avgHr: p.avg_heart_rate_bpm,
      maxHr: p.max_heart_rate_bpm,
      rpe,
      load,
      loadMethod: method,
      primary: p,
      recordings: [p, ...ranked.others],
      sourceLabel: deviceName(p.source),
      annotation,
      manual: null,
      excluded,
    });
  }
  for (const m of manualAll) {
    if (m.ow_workout_id) continue; // annotations are folded into their device session above
    const { load, method } = m.excluded ? { load: null, method: null } : computeLoad(ctx, m.duration_min, m.rpe, null);
    sessions.push({
      key: `manual:${m.id}`,
      date: m.date,
      start: m.start_time,
      family: (m.sport as SportFamily) ?? "other",
      type: m.sport,
      title: m.title || m.sport,
      durationMin: m.duration_min,
      distanceKm: m.distance_km,
      avgHr: null,
      maxHr: null,
      rpe: m.rpe,
      load,
      loadMethod: method,
      primary: null,
      recordings: [],
      sourceLabel: "Logged manually",
      annotation: null,
      manual: m,
      excluded: m.excluded ? "Excluded by you" : null,
    });
  }
  sessions.sort((a, b) => (a.date === b.date ? (a.start ?? "").localeCompare(b.start ?? "") : a.date.localeCompare(b.date)));
  return { sessions, owError };
}

/** Daily load totals; `unrated` counts included sessions with no load on or after `countFrom`. */
export function dailyLoad(sessions: TrainingSession[], countFrom = ""): { byDate: Map<ISODate, number>; methods: Set<LoadMethod>; unrated: number } {
  const byDate = new Map<ISODate, number>();
  const methods = new Set<LoadMethod>();
  let unrated = 0;
  for (const s of sessions) {
    if (s.excluded) continue;
    if (s.load == null || !s.loadMethod) { if (s.date >= countFrom) unrated++; continue; }
    methods.add(s.loadMethod);
    byDate.set(s.date, (byDate.get(s.date) ?? 0) + s.load);
  }
  return { byDate, methods, unrated };
}

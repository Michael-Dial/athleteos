import "server-only";
import type { ISODate } from "../dates";
import { getRecoverySummaries, getSleepSummaries } from "../ow/api";
import type { OwSource } from "../ow/types";
import { deviceKey, deviceName, rankBySource, type Ranked } from "../stats/sources";
import type { Metric } from "../settings";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";

/** One night, one device: every overnight metric that device produced. */
export interface NightRow {
  date: ISODate;
  key: string;
  name: string;
  source: OwSource;
  hrv: number | null; // RMSSD ms
  rhr: number | null;
  sleepMin: number | null;
  inBedMin: number | null;
  efficiency: number | null;
  deep: number | null;
  rem: number | null;
  light: number | null;
  awake: number | null;
  rr: number | null;
  spo2: number | null;
  start: string | null;
  end: string | null;
}

export const METRIC_VALUE: Record<Exclude<Metric, "workouts">, (r: NightRow) => number | null> = {
  hrv: (r) => r.hrv,
  rhr: (r) => r.rhr,
  sleep: (r) => r.sleepMin,
  respiratory_rate: (r) => r.rr,
  spo2: (r) => r.spo2,
};

export interface NightlyResult {
  rows: NightRow[];
  owError: string | null;
}

/**
 * Merge OW sleep and recovery summaries (all sources, no OW-side priority) into
 * one row per (night, device). Sleep summaries win where both report a field;
 * recovery fills HRV/RHR for devices whose sleep summary lacks them.
 */
export async function getNightly(ctx: AppCtx, start: ISODate, end: ISODate): Promise<NightlyResult> {
  if (!ctx.ow) return { rows: [], owError: null };
  try {
    const [sleep, recovery] = await Promise.all([
      getSleepSummaries(ctx.ow, start, end),
      getRecoverySummaries(ctx.ow, start, end),
    ]);
    const rows = new Map<string, NightRow>();
    const blank = (date: ISODate, source: OwSource): NightRow => ({
      date, key: deviceKey(source), name: deviceName(source), source,
      hrv: null, rhr: null, sleepMin: null, inBedMin: null, efficiency: null,
      deep: null, rem: null, light: null, awake: null, rr: null, spo2: null, start: null, end: null,
    });
    for (const s of sleep) {
      const k = `${s.date}|${deviceKey(s.source)}`;
      const r = rows.get(k) ?? blank(s.date, s.source);
      r.hrv ??= s.avg_hrv_rmssd_ms;
      r.rhr ??= s.resting_heart_rate_bpm;
      r.sleepMin ??= s.duration_minutes;
      r.inBedMin ??= s.time_in_bed_minutes;
      r.efficiency ??= s.efficiency_percent;
      r.deep ??= s.stages?.deep_minutes ?? null;
      r.rem ??= s.stages?.rem_minutes ?? null;
      r.light ??= s.stages?.light_minutes ?? null;
      r.awake ??= s.stages?.awake_minutes ?? null;
      r.rr ??= s.avg_respiratory_rate;
      r.spo2 ??= s.avg_spo2_percent;
      r.start ??= s.start_time;
      r.end ??= s.end_time;
      rows.set(k, r);
    }
    for (const s of recovery) {
      const k = `${s.date}|${deviceKey(s.source)}`;
      const r = rows.get(k) ?? blank(s.date, s.source);
      r.hrv ??= s.avg_hrv_rmssd_ms;
      r.rhr ??= s.resting_heart_rate_bpm;
      r.sleepMin ??= s.sleep_duration_seconds != null ? s.sleep_duration_seconds / 60 : null;
      r.efficiency ??= s.sleep_efficiency_percent;
      r.spo2 ??= s.avg_spo2_percent;
      rows.set(k, r);
    }
    return { rows: [...rows.values()].sort((a, b) => a.date.localeCompare(b.date)), owError: null };
  } catch (e) {
    return { rows: [], owError: errorMessage(e) };
  }
}

/** Devices ordered by how many nights they report `metric` (the unranked fallback order). */
export function coverageOrder(rows: NightRow[], metric: Exclude<Metric, "workouts">): string[] {
  const get = METRIC_VALUE[metric];
  const counts = new Map<string, number>();
  for (const r of rows) if (get(r) != null) counts.set(r.key, (counts.get(r.key) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

/**
 * Rows for one date that carry a value for `metric`, ranked by device priority;
 * unranked devices follow by coverage so the fallback matches the device that
 * backs the baseline.
 */
export function rankNight(ctx: AppCtx, rows: NightRow[], date: ISODate, metric: Exclude<Metric, "workouts">): Ranked<NightRow> {
  const get = METRIC_VALUE[metric];
  const day = rows.filter((r) => r.date === date && get(r) != null);
  return rankBySource(day, (r) => r.source, ctx.settings.devicePriority[metric] ?? [], coverageOrder(rows, metric));
}

/**
 * Pick the single device whose series backs a metric's baseline: the
 * highest-priority device with a value in the last `lookbackDays`, else the
 * device with the most nights. Baselines never mix devices.
 */
export function baselineDevice(
  ctx: AppCtx,
  rows: NightRow[],
  metric: Exclude<Metric, "workouts">,
  asOf: ISODate,
  lookbackFrom: ISODate,
): { key: string; name: string; fallback: boolean } | null {
  const get = METRIC_VALUE[metric];
  const recent = rows.filter((r) => r.date >= lookbackFrom && r.date <= asOf && get(r) != null);
  if (!recent.length) return null;
  const priority = ctx.settings.devicePriority[metric] ?? [];
  for (const k of priority) {
    const hit = recent.find((r) => r.key === k);
    if (hit) return { key: k, name: hit.name, fallback: false };
  }
  const recentKeys = new Set(recent.map((r) => r.key));
  const best = coverageOrder(rows, metric).find((k) => recentKeys.has(k));
  const hit = best ? recent.find((r) => r.key === best) : undefined;
  return hit ? { key: hit.key, name: hit.name, fallback: true } : null;
}

export function seriesFor(rows: NightRow[], key: string, metric: Exclude<Metric, "workouts">): Map<ISODate, number> {
  const get = METRIC_VALUE[metric];
  const m = new Map<ISODate, number>();
  for (const r of rows) {
    if (r.key !== key) continue;
    const v = get(r);
    if (v != null) m.set(r.date, v);
  }
  return m;
}

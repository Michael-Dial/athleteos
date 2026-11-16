import "server-only";
import { addDays, startOfWeek, type ISODate } from "../dates";
import { timeInBands } from "../stats/zones";
import { METRIC_INFO, zoneSet, type Band, type ZoneMetric } from "../zones";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";
import { sessionSeries, type SeriesKind } from "./session-series";
import { getTraining, type TrainingSession } from "./training";

export interface ZoneReport {
  metric: ZoneMetric;
  label: string;
  unit: string;
  start: ISODate;
  end: ISODate;
  sport: "all" | "run" | "ride" | "other";
  zoneSet: { model: string; modelLabel: string; bands: Band[] } | null;
  /** Why no zones could be built (missing threshold), with the setting to fix it. */
  needs: { reason: string; settingsKey: string } | null;
  total: { seconds: number[]; recordedSec: number; pct: number[]; sessions: number; sessionsWithout: number };
  weeks: { weekStart: ISODate; seconds: number[]; recordedSec: number }[];
  sessions: { key: string; date: ISODate; title: string; sport: string; durationMin: number | null; seconds: number[] | null; device: string | null; reason: string | null }[];
  owErrors: string[];
}

function matchesSport(s: TrainingSession, metric: ZoneMetric, sport: ZoneReport["sport"]): boolean {
  const fam = s.family;
  const need = METRIC_INFO[metric].sports;
  if (need === "run" && fam !== "run") return false;
  if (need === "ride" && fam !== "ride") return false;
  if (sport === "all") return true;
  if (sport === "other") return fam !== "run" && fam !== "ride";
  return fam === sport;
}

/**
 * Share of recorded time in each zone. The denominator is time with a valid
 * sample of this metric, so sessions recorded without the sensor don't dilute
 * the percentages; they are counted separately.
 */
export async function getZoneReport(ctx: AppCtx, metric: ZoneMetric, start: ISODate, end: ISODate, sport: ZoneReport["sport"] = "all"): Promise<ZoneReport> {
  const info = METRIC_INFO[metric];
  const zs = zoneSet(metric, ctx.settings);
  const training = await getTraining(ctx, start, end);
  const sessions = training.sessions.filter((x) => !x.excluded && matchesSport(x, metric, sport));
  const errors = new Set<string>();
  if (training.owError) errors.add(training.owError);
  const nBands = zs.ok ? zs.set.bands.length : 0;
  const rows: ZoneReport["sessions"] = new Array(sessions.length);

  let next = 0;
  const one = async (x: TrainingSession, i: number) => {
    const base = { key: x.key, date: x.date, title: x.title, sport: x.family, durationMin: x.durationMin };
    if (!zs.ok) { rows[i] = { ...base, seconds: null, device: null, reason: null }; return; }
    if (!x.primary) { rows[i] = { ...base, seconds: null, device: null, reason: "Logged manually" }; return; }
    try {
      const ser = await sessionSeries(ctx, x, info.series as SeriesKind[]);
      const kind = (info.series as SeriesKind[]).find((k) => ser.samples[k]?.length);
      if (!kind) { rows[i] = { ...base, seconds: null, device: null, reason: `No ${info.label.toLowerCase()} recorded` }; return; }
      const ignoreBelow = zs.set.ignoreBelow;
      const secs = timeInBands(ser.samples[kind]!, zs.set.upper, {
        maxGapSec: ctx.settings.intensity.maxGapSec, lastSampleSec: 60, window: ser.window ?? undefined,
        ignore: ignoreBelow != null ? (v) => v < ignoreBelow : undefined,
      });
      if (secs.every((v) => v === 0)) { rows[i] = { ...base, seconds: null, device: ser.device[kind] ?? null, reason: "No valid samples (all stopped or dropouts)" }; return; }
      rows[i] = { ...base, seconds: secs, device: ser.device[kind] ?? null, reason: null };
    } catch (e) {
      errors.add(errorMessage(e));
      rows[i] = { ...base, seconds: null, device: null, reason: "Data unavailable" };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, async () => {
    while (next < sessions.length) { const i = next++; await one(sessions[i], i); }
  }));

  const sum = (list: typeof rows) => list.reduce<number[]>((a, r) => (r.seconds ? a.map((v, j) => v + r.seconds![j]) : a), new Array(nBands).fill(0));
  const weeks: ZoneReport["weeks"] = [];
  for (let w = startOfWeek(start); w <= end; w = addDays(w, 7)) {
    const s = sum(rows.filter((r) => r.date >= w && r.date <= addDays(w, 6)));
    weeks.push({ weekStart: w, seconds: s, recordedSec: s.reduce((a, b) => a + b, 0) });
  }
  const tot = sum(rows);
  const recorded = tot.reduce((a, b) => a + b, 0);
  return {
    metric, label: info.label, unit: info.unit, start, end, sport,
    zoneSet: zs.ok ? { model: zs.set.model, modelLabel: zs.set.modelLabel, bands: zs.set.bands } : null,
    needs: zs.ok ? null : { reason: zs.reason, settingsKey: zs.settingsKey },
    total: {
      seconds: tot, recordedSec: recorded, pct: tot.map((v) => (recorded ? (v / recorded) * 100 : 0)),
      sessions: rows.filter((r) => r.seconds).length, sessionsWithout: rows.filter((r) => !r.seconds).length,
    },
    weeks, sessions: rows, owErrors: [...errors],
  };
}


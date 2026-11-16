import "server-only";
import { addDays, startOfWeek, type ISODate } from "../dates";
import { classify, timeInZones, type TidPattern, type ZoneBounds } from "../stats/zones";
import type { Settings } from "../settings";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";
import { getTraining, type TrainingSession } from "./training";
import { sessionSeries } from "./session-series";

export function zoneBounds(s: Settings): ZoneBounds & { source: "thresholds" | "hrmax" } {
  const i = s.intensity;
  if (i.lt1Hr != null && i.lt2Hr != null && i.lt2Hr > i.lt1Hr) return { z1Max: i.lt1Hr, z2Max: i.lt2Hr, source: "thresholds" };
  return { z1Max: Math.round((s.load.hrMax * i.z1MaxPctHrMax) / 100), z2Max: Math.round((s.load.hrMax * i.z2MaxPctHrMax) / 100), source: "hrmax" };
}

type Mins = [number, number, number];

export interface IntensityReport {
  start: ISODate;
  end: ISODate;
  bounds: { z1MaxBpm: number; z2MaxBpm: number; source: "thresholds" | "hrmax" };
  total: { zonesMin: Mins; pattern: TidPattern; polarizationIndex: number | null; noHrMin: number };
  weeks: { weekStart: ISODate; zonesMin: Mins; pattern: TidPattern; polarizationIndex: number | null; sessions: number; noHrMin: number }[];
  sessions: { key: string; date: ISODate; title: string; sport: string; durationMin: number | null; zonesMin: Mins | null; device: string; reason: string | null }[];
  owErrors: string[];
}

/**
 * Time in three HR zones per session, from the 1-minute HR series of the
 * highest-priority recording that has HR (fetched by data source, so other
 * devices' HR never mixes in). One-minute means smooth short spikes, so brief Z3
 * efforts are somewhat under-counted.
 */
export async function getIntensity(ctx: AppCtx, start: ISODate, end: ISODate): Promise<IntensityReport> {
  const s = ctx.settings;
  const b = zoneBounds(s);
  const training = await getTraining(ctx, start, end);
  const sessions = training.sessions.filter((x) => !x.excluded);
  const errors = new Set<string>();
  if (training.owError) errors.add(training.owError);

  const results: IntensityReport["sessions"] = new Array(sessions.length);
  let next = 0;
  const one = async (x: TrainingSession, i: number) => {
    const base = { key: x.key, date: x.date, title: x.title, sport: x.family, durationMin: x.durationMin };
    if (!x.primary || !ctx.ow) { results[i] = { ...base, device: x.sourceLabel, zonesMin: null, reason: "Logged manually (no HR)" }; return; }
    try {
      // HR from the first recording (by device priority) that has it.
      const ser = await sessionSeries(ctx, x, ["heart_rate"]);
      const hr = ser.samples.heart_rate;
      if (!hr?.length) { results[i] = { ...base, device: x.sourceLabel, zonesMin: null, reason: "No HR samples from these devices" }; return; }
      const z = timeInZones(hr.map((r) => ({ t: r.t, hr: r.v })), b, s.intensity.maxGapSec, 60, ser.window ?? undefined);
      results[i] = { ...base, device: ser.device.heart_rate ?? x.sourceLabel, zonesMin: [z[0] / 60, z[1] / 60, z[2] / 60], reason: null };
    } catch (e) {
      errors.add(errorMessage(e));
      results[i] = { ...base, device: x.sourceLabel, zonesMin: null, reason: "HR unavailable" };
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, sessions.length) }, async () => {
    while (next < sessions.length) { const i = next++; await one(sessions[i], i); }
  }));

  const sumZones = (rows: typeof results): Mins => rows.reduce<Mins>((a, r) => (r.zonesMin ? [a[0] + r.zonesMin[0], a[1] + r.zonesMin[1], a[2] + r.zonesMin[2]] : a), [0, 0, 0]);
  const noHr = (rows: typeof results) => rows.filter((r) => !r.zonesMin).reduce((a, r) => a + (r.durationMin ?? 0), 0);
  const weeks: IntensityReport["weeks"] = [];
  for (let w = startOfWeek(start); w <= end; w = addDays(w, 7)) {
    const rows = results.filter((r) => r.date >= w && r.date <= addDays(w, 6));
    const z = sumZones(rows);
    const c = classify(z);
    weeks.push({ weekStart: w, zonesMin: z, pattern: c.pattern, polarizationIndex: c.pi, sessions: rows.length, noHrMin: noHr(rows) });
  }
  const tz = sumZones(results);
  const tc = classify(tz);
  return {
    start, end,
    bounds: { z1MaxBpm: b.z1Max, z2MaxBpm: b.z2Max, source: b.source },
    total: { zonesMin: tz, pattern: tc.pattern, polarizationIndex: tc.pi, noHrMin: noHr(results) },
    weeks, sessions: results, owErrors: [...errors],
  };
}

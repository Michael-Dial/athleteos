import { z } from "zod";
import { q } from "./db";

// Every tuning knob lives here (and in the settings table), never inline in
// analysis code. Defaults cite the convention they follow.
export const METRICS = ["hrv", "rhr", "sleep", "respiratory_rate", "spo2", "workouts"] as const;
export type Metric = (typeof METRICS)[number];

export const METRIC_LABEL: Record<Metric, string> = {
  hrv: "HRV (RMSSD)",
  rhr: "Resting HR",
  sleep: "Sleep",
  respiratory_rate: "Respiratory rate",
  spo2: "SpO₂",
  workouts: "Workouts",
};

export const SettingsSchema = z.object({
  timezone: z.string().default("America/New_York"),
  ow: z
    .object({
      // Off by default, matching OW: aggregator copies of a directly connected
      // maker are hidden. Turn on when comparing relay vs direct data.
      includeRedundantRelays: z.boolean().default(false),
      cacheTtlSeconds: z.number().int().min(0).max(3600).default(300),
      // Whole months that ended over a week ago rarely change; cache them longer.
      historicalCacheTtlSeconds: z.number().int().min(0).max(86400).default(1800),
    })
    .prefault({}),
  // Ordered OW device_ids per metric. The first device with data on a given day
  // is shown as primary; every other device's value stays visible beside it.
  devicePriority: z.record(z.string(), z.array(z.string())).default({}),
  hrv: z
    .object({
      // Plews et al. 2012/2013: 7-day rolling mean of lnRMSSD against a
      // longer individual baseline, with SWC = 0.5 x SD of that baseline.
      rollingDays: z.number().int().min(3).max(14).default(7),
      baselineDays: z.number().int().min(14).max(120).default(60),
      swcSd: z.number().min(0.1).max(2).default(0.5),
      minBaselineN: z.number().int().min(5).max(60).default(14),
    })
    .prefault({}),
  baselines: z
    .object({
      // Window for individual z-scores of RHR, sleep and wellness.
      windowDays: z.number().int().min(7).max(120).default(28),
      minN: z.number().int().min(3).max(60).default(7),
      zFlag: z.number().min(0.5).max(3).default(1.0),
    })
    .prefault({}),
  load: z
    .object({
      // sRPE (Foster 2001) is the default internal-load unit; TRIMP is used only
      // for device workouts with no RPE when fallback is enabled. Mixing units in
      // one ACWR is flagged in the UI.
      method: z.enum(["srpe", "trimp", "duration"]).default("srpe"),
      // Off by default: mixing sRPE and TRIMP units in one ACWR is not meaningful.
      trimpFallback: z.boolean().default(false),
      acuteDays: z.number().int().min(3).max(14).default(7),
      chronicDays: z.number().int().min(14).max(56).default(28),
      // EWMA per Williams et al. 2017 avoids the coupling/spike artefacts of
      // rolling averages (Menaspà 2017). Rolling kept for comparability.
      acwrModel: z.enum(["ewma", "rolling"]).default("ewma"),
      hrRest: z.number().min(25).max(100).default(50),
      hrMax: z.number().min(120).max(230).default(190),
      trimpSex: z.enum(["male", "female"]).default("male"),
    })
    .prefault({}),
  training: z
    .object({
      // Device recordings that are not training (overnight captures, reference
      // devices) can be excluded wholesale by device or by type.
      excludeDevices: z.array(z.string()).default([]),
      excludeTypes: z.array(z.string()).default([]),
      minDurationMin: z.number().min(0).max(120).default(5),
      maxDurationHours: z.number().min(1).max(48).default(6),
    })
    .prefault({}),
  matching: z
    .object({
      // Max start-time gap (minutes) when auto-matching a device workout to a
      // planned session that carries no explicit time. Same-day only.
      workoutDayToleranceHours: z.number().min(0).max(24).default(6),
    })
    .prefault({}),
  compare: z
    .object({
      // Cross-device comparison: OW has no cross-device clock offset, so the
      // lag between two series is searched within +/- this tolerance.
      epochSeconds: z.number().int().min(1).max(3600).default(60),
      lagToleranceSeconds: z.number().int().min(0).max(3600).default(300),
      lagStepSeconds: z.number().int().min(1).max(600).default(5),
      minPairs: z.number().int().min(5).max(10000).default(30),
    })
    .prefault({}),
  readiness: z
    .object({
      weights: z
        .object({
          hrv: z.number().min(0).max(5).default(1),
          rhr: z.number().min(0).max(5).default(1),
          sleep: z.number().min(0).max(5).default(1),
          wellness: z.number().min(0).max(5).default(1),
          load: z.number().min(0).max(5).default(1),
        })
        .prefault({}),
      // ACWR band considered "within range" (Gabbett 2016 sweet spot). Shown as
      // context only; the band is contested (Impellizzeri et al. 2020).
      acwrLow: z.number().min(0).max(2).default(0.8),
      acwrHigh: z.number().min(0.5).max(3).default(1.3),
      sleepTargetMin: z.number().min(180).max(720).default(480),
    })
    .prefault({}),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type SettingsKey = keyof Settings;

export function defaultSettings(): Settings {
  return SettingsSchema.parse({});
}

export async function getSettings(athleteId: number): Promise<Settings> {
  const rows = await q<{ key: string; value: unknown }>("SELECT key, value FROM settings WHERE athlete_id = $1", [athleteId]);
  const raw: Record<string, unknown> = {};
  for (const r of rows) raw[r.key] = r.value;
  // A stored value that no longer validates (schema moved on) falls back to its
  // default for that key only, rather than breaking every page.
  const parsed = SettingsSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const out = defaultSettings() as Record<string, unknown>;
  for (const [k, v] of Object.entries(raw)) {
    const one = SettingsSchema.safeParse({ [k]: v });
    if (one.success) out[k] = (one.data as Record<string, unknown>)[k];
  }
  return out as Settings;
}

export async function saveSettings(athleteId: number, next: Partial<Settings>): Promise<Settings> {
  const merged = SettingsSchema.parse({ ...(await getSettings(athleteId)), ...next });
  for (const key of Object.keys(next) as SettingsKey[]) {
    await q(
      `INSERT INTO settings (athlete_id, key, value, updated_at) VALUES ($1,$2,$3,now())
       ON CONFLICT (athlete_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [athleteId, key, JSON.stringify(merged[key])],
    );
  }
  return merged;
}

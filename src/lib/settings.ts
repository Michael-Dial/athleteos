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
  // The AthleteOS iPhone app, which also relays Apple Health into the device
  // backend. Named here so the athlete-facing setup steps can link to it.
  phoneApp: z
    .object({
      name: z.string().max(60).default(""),
      installUrl: z.union([z.literal(""), z.url({ protocol: /^https$/ })]).default(""),
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
      // Recordings overlapping by at least this fraction of the shorter one
      // are treated as the same session from different devices.
      sameSessionOverlap: z.number().min(0.1).max(1).default(0.5),
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
  coverage: z
    .object({
      // A provider account with no sync for this long is flagged. Webhook
      // providers may legitimately go quiet on days with no new data.
      staleHours: z.number().min(6).max(720).default(48),
      adherenceDays: z.number().int().min(7).max(90).default(28),
    })
    .prefault({}),
  review: z
    .object({
      // Weekly-review observations. Monotony above ~2 preceded illness in
      // Foster (1998); compliance is planned sessions done / not skipped.
      monotonyFlag: z.number().min(1).max(5).default(2),
      complianceFlagPct: z.number().min(0).max(100).default(80),
      comparisonWeeks: z.number().int().min(1).max(8).default(3),
    })
    .prefault({}),
  intensity: z
    .object({
      // Three-zone HR model. Set LT1/LT2 (or VT1/VT2) heart rates from testing;
      // until then zones fall back to %HRmax approximations, labelled as such.
      lt1Hr: z.number().min(60).max(230).nullable().default(null),
      lt2Hr: z.number().min(60).max(230).nullable().default(null),
      z1MaxPctHrMax: z.number().min(50).max(95).default(82),
      z2MaxPctHrMax: z.number().min(55).max(100).default(87),
      // Longest gap between HR samples credited to the earlier sample's zone.
      maxGapSec: z.number().int().min(10).max(600).default(120),
    })
    .prefault({}),
  zones: z
    .object({
      hr: z.object({
        model: z.enum(["lthr5", "hrmax5", "three", "custom"]).default("hrmax5"),
        lthr: z.number().min(80).max(220).nullable().default(null),
        custom: z.array(z.number().min(40).max(230)).max(9).default([]),
      }).prefault({}),
      pace: z.object({
        model: z.enum(["threshold5", "custom"]).default("threshold5"),
        thresholdPaceSecPerKm: z.number().min(150).max(600).nullable().default(null),
        custom: z.array(z.number().min(120).max(900)).max(9).default([]).describe("Boundaries as sec/km"),
      }).prefault({}),
      runpower: z.object({
        model: z.enum(["cp5", "custom"]).default("cp5"),
        criticalPowerW: z.number().min(50).max(800).nullable().default(null),
        custom: z.array(z.number().min(0).max(2000)).max(9).default([]),
      }).prefault({}),
      bikepower: z.object({
        model: z.enum(["ftp7", "custom"]).default("ftp7"),
        ftpW: z.number().min(50).max(600).nullable().default(null),
        custom: z.array(z.number().min(0).max(2500)).max(9).default([]),
      }).prefault({}),
    })
    .prefault({}),
  illness: z
    .object({
      baselineDays: z.number().int().min(14).max(90).default(28),
      // Baseline ends this many days before the assessed night, so an
      // illness that has been building for days isn't absorbed into it.
      baselineLagDays: z.number().int().min(0).max(21).default(7),
      minBaselineN: z.number().int().min(5).max(60).default(14),
      z: z.number().min(0.5).max(4).default(1.5),
      minSignals: z.number().int().min(1).max(4).default(2),
    })
    .prefault({}),
  reminders: z
    .object({
      // Morning check-in push (installed PWA). Sent once per day when a daily
      // form is still unanswered, within lateWindowHours of the set time so a
      // restart can't fire a 07:30 reminder at night.
      morningEnabled: z.boolean().default(true),
      morningTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "HH:MM, 24-hour").default("07:30"),
      lateWindowHours: z.number().min(0.5).max(12).default(3),
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
      // |z| at which a pillar (and the index) moves from normal to "watch".
      watchZ: z.number().min(0.1).max(2).default(0.5),
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

function deepMerge(a: Record<string, unknown> | undefined, b: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) {
    o[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(o[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return o;
}

/**
 * Apply a partial, possibly nested change (e.g. {hrv: {swcSd: 0.6}}) over the
 * current settings, validate the result, and persist the touched sections.
 * Throws a ZodError when the merged settings are invalid; nothing is saved then.
 */
export async function patchSettings(athleteId: number, patch: Record<string, unknown>): Promise<Settings> {
  const current = (await getSettings(athleteId)) as unknown as Record<string, unknown>;
  const merged = deepMerge(current, patch);
  if (typeof merged.timezone === "string") {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: merged.timezone });
    } catch {
      throw new z.ZodError([{ code: "custom", path: ["timezone"], message: "unknown timezone; use an IANA name like America/New_York", input: merged.timezone }]);
    }
  }
  const valid = SettingsSchema.parse(merged);
  const touched = Object.keys(patch).filter((k): k is SettingsKey => k in valid);
  return saveSettings(athleteId, Object.fromEntries(touched.map((k) => [k, valid[k]])) as Partial<Settings>);
}

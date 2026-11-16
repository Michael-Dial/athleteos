import { z } from "zod";
import type { WeeklyReview } from "../domain/review";
import type { CoverageReport } from "../domain/coverage";
import type { IntensityReport } from "../domain/intensity";
import type { TrendsReport } from "../domain/trends";
import type { IllnessReport } from "../domain/illness";

// Response schemas for the dashboard endpoints. The domain functions already
// return these shapes; the type assertions at the bottom fail compilation if
// a domain type and its schema drift apart.

const n = z.number().nullable();
const D = z.string();
const Dev = z.object({ key: z.string(), name: z.string(), fallback: z.boolean() }).nullable();
const Zones = z.tuple([z.number(), z.number(), z.number()]).describe("Minutes in Z1, Z2, Z3");
const Pattern = z.enum(["polarized", "pyramidal", "threshold", "high-intensity", "insufficient"]);

export const ReviewDto = z.object({
  weekStart: D, weekEnd: D, daysElapsed: z.number(),
  training: z.object({
    planned: z.number(), completed: z.number(), skipped: z.number(), missed: z.number(), unplanned: z.number(), compliancePct: n,
    plannedDurationMin: z.number(), actualDurationMin: z.number(), plannedLoad: z.number(), actualLoad: z.number(),
    unrated: z.number(), loadMethods: z.array(z.string()),
    bySport: z.array(z.object({ sport: z.string(), sessions: z.number(), durationMin: z.number(), load: z.number() })),
    monotony: n, strain: n, acwrAtEnd: n,
    sessions: z.array(z.object({ key: z.string(), date: D, title: z.string(), sport: z.string(), durationMin: n, rpe: n, load: n, planned: z.string().nullable(), source: z.string() })),
  }),
  hrv: z.object({ device: Dev, weeks: z.array(z.object({ weekStart: D, n: z.number(), meanLn: n, geoMeanMs: n, cvPct: n })) }),
  rhr: z.object({ device: Dev, weeks: z.array(z.object({ weekStart: D, n: z.number(), mean: n, sd: n })) }),
  sleep: z.object({ device: Dev, weeks: z.array(z.object({ weekStart: D, n: z.number(), meanMin: n, sdMin: n, midpointSdMin: n, meanBedtime: z.string().nullable(), meanWake: z.string().nullable() })) }),
  wellness: z.object({
    answeredDays: z.number(),
    weeks: z.array(z.object({ weekStart: D, n: z.number(), composite: n })),
    items: z.array(z.object({ key: z.string(), label: z.string(), thisWeek: n, priorWeeks: n })),
  }),
  checkIns: z.array(z.object({ name: z.string(), date: D, answers: z.array(z.object({ label: z.string(), value: z.string() })) })),
  observations: z.array(z.string()),
  owErrors: z.array(z.string()),
});

export const CoverageDto = z.object({
  start: D, end: D, dates: z.array(D),
  devices: z.array(z.object({
    key: z.string(), name: z.string(), nights: z.number(), hrvNights: z.number(), pct: z.number(), longestGap: z.number(), lastNight: D.nullable(),
    cells: z.string().describe("One char per date: 2 = sleep+HRV, 1 = overnight data without HRV, 0 = nothing"),
  })),
  baselines: z.array(z.object({ metric: z.string(), device: Dev, pct: n, longestGap: n, lastNight: D.nullable() })),
  ow: z.object({ reachable: z.boolean(), latencyMs: n, error: z.string().nullable() }),
  connections: z.array(z.object({ provider: z.string(), account: z.string(), status: z.string(), lastSyncedAt: z.string().nullable(), hoursSinceSync: n, stale: z.boolean() })),
  questionnaires: z.array(z.object({ slug: z.string(), name: z.string(), answered: z.number(), days: z.number(), pct: z.number(), missing: z.array(D) })),
  unratedSessions: z.number(),
  owErrors: z.array(z.string()),
});

export const IntensityDto = z.object({
  start: D, end: D,
  bounds: z.object({ z1MaxBpm: z.number(), z2MaxBpm: z.number(), source: z.enum(["thresholds", "hrmax"]) }),
  total: z.object({ zonesMin: Zones, pattern: Pattern, polarizationIndex: n, noHrMin: z.number() }),
  weeks: z.array(z.object({ weekStart: D, zonesMin: Zones, pattern: Pattern, polarizationIndex: n, sessions: z.number(), noHrMin: z.number() })),
  sessions: z.array(z.object({ key: z.string(), date: D, title: z.string(), sport: z.string(), durationMin: n, zonesMin: Zones.nullable(), device: z.string(), reason: z.string().nullable() })),
  owErrors: z.array(z.string()),
});

const DeviceSeries = z.object({
  device: z.object({ key: z.string(), name: z.string() }),
  points: z.array(z.object({ weekStart: D, value: z.number(), n: z.number(), cvPct: n.optional() })),
});
export const TrendsDto = z.object({
  weeks: z.array(D),
  load: z.array(z.object({ weekStart: D, load: z.number(), durationMin: z.number(), sessions: z.number(), unrated: z.number() })),
  loadMethods: z.array(z.string()),
  hrv: z.array(DeviceSeries).describe("Weekly geometric mean RMSSD (ms) per device; cvPct = CV of lnRMSSD"),
  rhr: z.array(DeviceSeries), sleep: z.array(DeviceSeries), bodyMass: z.array(DeviceSeries), vo2max: z.array(DeviceSeries),
  owErrors: z.array(z.string()),
});

const Signal = z.object({ key: z.enum(["rhr", "rr", "temp", "hrv"]), value: n, baselineMean: n, baselineSd: n, n: z.number(), z: n, firing: z.boolean() });
const Night = z.object({ date: D, signals: z.array(Signal), firing: z.number(), assessed: z.number(), level: z.enum(["none", "watch", "alert", "insufficient"]) });
export const IllnessDto = z.object({
  date: D,
  devices: z.object({ rhr: Dev, rr: Dev, temp: Dev, hrv: Dev }),
  nights: z.array(Night),
  latest: Night.nullable(),
  selfReported: z.array(D),
  owErrors: z.array(z.string()),
});

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const assertSame = <T extends true>(_: T) => _;
assertSame<Same<z.infer<typeof ReviewDto>, WeeklyReview>>(true);
assertSame<Same<z.infer<typeof CoverageDto>, CoverageReport>>(true);
assertSame<Same<z.infer<typeof IntensityDto>, IntensityReport>>(true);
assertSame<Same<z.infer<typeof TrendsDto>, TrendsReport>>(true);
assertSame<Same<z.infer<typeof IllnessDto>, IllnessReport>>(true);

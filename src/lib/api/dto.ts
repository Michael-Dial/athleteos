import { z } from "zod";
import type { NightRow } from "../domain/nightly";
import type { Readiness } from "../domain/readiness";
import type { TrainingSession } from "../domain/training";
import type { PlanPhase, PlanSession } from "../domain/plan";
import type { QuestionnaireDef, QuestionnaireResponse, WellnessDay } from "../domain/questionnaires";
import { deviceKey, deviceName } from "../stats/sources";
import { ItemSchema } from "../domain/questionnaire-schema";

// Response contract for /api/v1. These schemas generate the OpenAPI document
// and are asserted in tests, so the native apps can rely on them.
// Field names are camelCase; dates are YYYY-MM-DD; instants are ISO 8601.

const num = z.number().nullable();
const Device = z.object({ key: z.string(), name: z.string() }).describe("Physical device a value came from");

export const NightDto = z.object({
  date: z.string(), device: Device,
  hrvRmssdMs: num, restingHrBpm: num, sleepMin: num, inBedMin: num, efficiencyPct: num,
  deepMin: num, remMin: num, lightMin: num, awakeMin: num, respiratoryRate: num, spo2Pct: num,
  bedtime: z.string().nullable(), wakeTime: z.string().nullable(),
});
export function nightDto(r: NightRow): z.infer<typeof NightDto> {
  return {
    date: r.date, device: { key: r.key, name: r.name },
    hrvRmssdMs: r.hrv, restingHrBpm: r.rhr, sleepMin: r.sleepMin, inBedMin: r.inBedMin, efficiencyPct: r.efficiency,
    deepMin: r.deep, remMin: r.rem, lightMin: r.light, awakeMin: r.awake, respiratoryRate: r.rr, spo2Pct: r.spo2,
    bedtime: r.start, wakeTime: r.end,
  };
}

const Recording = z.object({
  owWorkoutId: z.string(), device: Device, type: z.string(), start: z.string(), end: z.string(),
  durationMin: num, avgHrBpm: num, maxHrBpm: num, distanceKm: num, caloriesKcal: num, avgPowerW: num,
});
export const TrainingDto = z.object({
  key: z.string().describe("ow:<workout id> or manual:<id>"),
  date: z.string(), start: z.string().nullable(), sport: z.string(), type: z.string(), title: z.string(),
  durationMin: num, distanceKm: num, avgHrBpm: num, maxHrBpm: num, rpe: num,
  load: num, loadMethod: z.enum(["srpe", "trimp", "duration"]).nullable(),
  source: z.string().describe("Device of the primary recording, or 'Logged manually'"),
  recordings: z.array(Recording).describe("Every device's copy; the first is primary"),
  notes: z.string().nullable(), planSessionId: z.number().nullable(), excluded: z.string().nullable(),
  manualId: z.number().nullable(),
});
export function trainingDto(s: TrainingSession): z.infer<typeof TrainingDto> {
  const ann = s.annotation ?? s.manual;
  return {
    key: s.key, date: s.date, start: s.start, sport: s.family, type: s.type, title: s.title,
    durationMin: s.durationMin, distanceKm: s.distanceKm, avgHrBpm: s.avgHr, maxHrBpm: s.maxHr, rpe: s.rpe,
    load: s.load, loadMethod: s.loadMethod, source: s.sourceLabel,
    recordings: s.recordings.map((r) => ({
      owWorkoutId: r.id, device: { key: deviceKey(r.source), name: deviceName(r.source) }, type: r.type, start: r.start_time, end: r.end_time,
      durationMin: r.duration_seconds != null ? r.duration_seconds / 60 : null, avgHrBpm: r.avg_heart_rate_bpm, maxHrBpm: r.max_heart_rate_bpm,
      distanceKm: r.distance_meters != null ? r.distance_meters / 1000 : null, caloriesKcal: r.calories_kcal, avgPowerW: r.average_watts,
    })),
    notes: ann?.notes ?? null, planSessionId: ann?.plan_session_id ?? null, excluded: s.excluded, manualId: s.manual?.id ?? null,
  };
}

export const PhaseDto = z.object({ id: z.number(), name: z.string(), kind: z.string(), startDate: z.string(), endDate: z.string(), goal: z.string().nullable(), notes: z.string().nullable() });
export const phaseDto = (p: PlanPhase): z.infer<typeof PhaseDto> => ({ id: p.id, name: p.name, kind: p.kind, startDate: p.start_date, endDate: p.end_date, goal: p.goal, notes: p.notes });

export const PlanSessionDto = z.object({
  id: z.number(), phaseId: z.number().nullable(), date: z.string(), sport: z.string(), title: z.string(),
  description: z.string().nullable(), intensity: z.string().nullable(), plannedDurationMin: num, plannedDistanceKm: num,
  plannedRpe: num, plannedLoad: num, owWorkoutId: z.string().nullable(), skipped: z.boolean(),
  status: z.enum(["planned", "done", "missed", "skipped"]),
  actualKey: z.string().nullable().describe("Training session key that fulfilled it"),
  match: z.enum(["linked", "auto"]).nullable(),
});
export function planSessionDto(p: PlanSession, status: z.infer<typeof PlanSessionDto>["status"], actualKey: string | null, match: "linked" | "auto" | null, plannedLoad: number | null): z.infer<typeof PlanSessionDto> {
  return {
    id: p.id, phaseId: p.phase_id, date: p.date, sport: p.sport, title: p.title, description: p.description, intensity: p.intensity,
    plannedDurationMin: p.planned_duration_min, plannedDistanceKm: p.planned_distance_km, plannedRpe: p.planned_rpe, plannedLoad,
    owWorkoutId: p.ow_workout_id, skipped: p.skipped, status, actualKey, match,
  };
}

export const QuestionnaireDto = z.object({
  slug: z.string(), name: z.string(), description: z.string().nullable(), kind: z.enum(["wellness", "custom"]),
  schedule: z.enum(["daily", "weekly", "adhoc"]), version: z.number(), active: z.boolean(), items: z.array(ItemSchema),
});
export const questionnaireDto = (d: QuestionnaireDef): z.infer<typeof QuestionnaireDto> => ({
  slug: d.slug, name: d.name, description: d.description, kind: d.kind, schedule: d.schedule, version: d.version, active: d.active, items: d.items,
});

export const ResponseDto = z.object({
  date: z.string(), version: z.number(), answers: z.record(z.string(), z.union([z.number(), z.boolean(), z.string(), z.null()])), submittedAt: z.string(),
});
export const responseDto = (r: QuestionnaireResponse): z.infer<typeof ResponseDto> => ({
  date: r.date, version: r.def_version, answers: r.answers, submittedAt: new Date(r.submitted_at).toISOString(),
});

export const WellnessDto = z.object({ date: z.string(), composite: z.number(), itemScores: z.record(z.string(), z.number()) });
export const wellnessDto = (w: WellnessDay): z.infer<typeof WellnessDto> => ({ date: w.date, composite: Number(w.composite), itemScores: w.item_scores });

const State = z.enum(["ok", "watch", "flag", "nodata"]);
const BaselineDevice = z.object({ key: z.string(), name: z.string(), fallback: z.boolean() }).nullable();
const Z = z.object({ value: num, mean: num, sd: num, n: z.number(), z: num }).nullable();
export const ReadinessDto = z.object({
  date: z.string(),
  overall: z.enum(["green", "amber", "red", "unknown"]),
  index: num.describe("Weighted mean of direction-oriented z-scores (positive = favourable)"),
  hrv: z.object({
    state: State, note: z.string().nullable(), device: BaselineDevice,
    lastNightMs: num, lastNightLn: num, rollingLn: num, rollingMs: num, rollingCvPct: num, rollingN: z.number().nullable(),
    baselineLn: num, baselineSdLn: num, baselineN: z.number().nullable(), normalLowLn: num, normalHighLn: num,
    status: z.enum(["below", "within", "above", "insufficient"]).nullable(),
    series: z.array(z.object({ date: z.string(), ln: num, rollingLn: num, normalLowLn: num, normalHighLn: num })),
  }),
  restingHr: z.object({ state: State, note: z.string().nullable(), device: BaselineDevice, z: Z, staleFrom: z.string().nullable() }),
  sleep: z.object({ state: State, note: z.string().nullable(), device: BaselineDevice, z: Z, staleFrom: z.string().nullable() }),
  wellness: z.object({ state: State, note: z.string().nullable(), composite: num, z: Z, lowItems: z.array(z.object({ key: z.string(), z: z.number() })) }),
  load: z.object({
    state: State, note: z.string().nullable(), acwr: num, acute: num, chronic: num, weekLoad: z.number(), monotony: num, strain: num,
    methods: z.array(z.string()), unrated: z.number(),
    series: z.array(z.object({ date: z.string(), load: z.number(), acwr: num })),
  }),
  errors: z.array(z.string()).describe("Open Wearables problems; device pillars are empty when present"),
});
export function readinessDto(r: Readiness, withSeries: boolean): z.infer<typeof ReadinessDto> {
  const p = r.hrv.point;
  const zr = (x: typeof r.rhr.z) => (x ? { value: x.value, mean: x.mean, sd: x.sd, n: x.n, z: x.z } : null);
  return {
    date: r.date, overall: r.overall, index: r.index,
    hrv: {
      state: r.hrv.state, note: r.hrv.note, device: r.hrv.device,
      lastNightMs: p?.rmssd ?? null, lastNightLn: p?.ln ?? null, rollingLn: p?.rollingLn ?? null, rollingMs: p?.rollingMs ?? null,
      rollingCvPct: p?.rollingCv ?? null, rollingN: p?.rollingN ?? null, baselineLn: p?.baselineLn ?? null, baselineSdLn: p?.baselineSd ?? null,
      baselineN: p?.baselineN ?? null, normalLowLn: p?.swcLow ?? null, normalHighLn: p?.swcHigh ?? null, status: p?.status ?? null,
      series: withSeries ? r.hrv.series.map((x) => ({ date: x.date, ln: x.ln, rollingLn: x.rollingLn, normalLowLn: x.swcLow, normalHighLn: x.swcHigh })) : [],
    },
    restingHr: { state: r.rhr.state, note: r.rhr.note, device: r.rhr.device, z: zr(r.rhr.z), staleFrom: r.rhr.stale },
    sleep: { state: r.sleep.state, note: r.sleep.note, device: r.sleep.device, z: zr(r.sleep.z), staleFrom: r.sleep.stale },
    wellness: { state: r.wellness.state, note: r.wellness.note, composite: r.wellness.today ? Number(r.wellness.today.composite) : null, z: zr(r.wellness.z), lowItems: r.wellness.lowItems },
    load: {
      state: r.load.state, note: r.load.note, acwr: r.load.point?.acwr ?? null, acute: r.load.point?.acute ?? null, chronic: r.load.point?.chronic ?? null,
      weekLoad: r.load.weekLoad, monotony: r.load.monotony, strain: r.load.strain, methods: r.load.methods, unrated: r.load.unrated,
      series: withSeries ? r.load.series.map((x) => ({ date: x.date, load: x.load, acwr: x.acwr })) : [],
    },
    errors: r.errors,
  };
}

const MetricValue = z.object({ device: Device, value: z.number(), fallback: z.boolean().optional() });
export const LastNightDto = z.object({
  primary: MetricValue.nullable().describe("Chosen by your device priority for this metric"),
  others: z.array(MetricValue).describe("Every other device's value for the same night"),
});

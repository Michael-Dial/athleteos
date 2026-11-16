import { z } from "zod";
import { isISODate } from "../dates";
import { SPORT_FAMILIES } from "../sports";
import { PHASE_KINDS } from "./plan-kinds";

// One validation contract for every client: web forms, the JSON API and the
// native apps all go through these schemas before anything is written.

const isoDate = z.string().refine(isISODate, "must be a YYYY-MM-DD date");
const rpe = z.number().min(0).max(10).nullable();
// undefined = "leave unchanged" (partial updates); "" or null = clear.
const optText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => (v === undefined ? undefined : v ? v : null));
const sport = z.enum(SPORT_FAMILIES);

export const AnnotationInput = z.object({
  owWorkoutId: z.string().min(1).max(200),
  date: isoDate,
  startTime: z.string().max(40).nullable().optional(),
  sport: z.string().max(40).default("other"),
  durationMin: z.number().min(0).default(0),
  rpe: rpe.optional(),
  title: optText(200),
  notes: optText(4000),
  planSessionId: z.number().int().positive().nullable().optional(),
  excluded: z.boolean().optional(),
});
export type AnnotationInput = z.infer<typeof AnnotationInput>;

export const ManualSessionInput = z.object({
  date: isoDate,
  sport,
  title: optText(200),
  durationMin: z.number().gt(0, "duration must be more than 0 minutes"),
  distanceKm: z.number().min(0).nullable().optional(),
  rpe: rpe.optional(),
  planSessionId: z.number().int().positive().nullable().optional(),
  notes: optText(4000),
});
export type ManualSessionInput = z.infer<typeof ManualSessionInput>;

export const PlanSessionInput = z.object({
  date: isoDate,
  sport,
  title: z.string().trim().min(1, "give the session a title").max(200),
  description: optText(4000),
  intensity: optText(200),
  plannedDurationMin: z.number().min(0).nullable().optional(),
  plannedDistanceKm: z.number().min(0).nullable().optional(),
  plannedRpe: rpe.optional(),
  owWorkoutId: optText(200),
  skipped: z.boolean().default(false),
});
export type PlanSessionInput = z.infer<typeof PlanSessionInput>;

export const PhaseInput = z
  .object({
    name: z.string().trim().min(1, "name the phase").max(120),
    kind: z.enum(PHASE_KINDS),
    startDate: isoDate,
    endDate: isoDate,
    goal: optText(500),
    notes: optText(4000),
  })
  .refine((p) => p.endDate >= p.startDate, { message: "end date must be on or after the start date", path: ["endDate"] });
export type PhaseInput = z.infer<typeof PhaseInput>;

export const CopyWeekInput = z.object({ weekStart: isoDate, weeks: z.number().int().min(1).max(12) });

/** First human-readable message from a zod error, for form redirects. */
export function firstIssue(e: z.ZodError): string {
  const i = e.issues[0];
  return i ? `${i.path.length ? `${i.path.join(".")}: ` : ""}${i.message}` : "invalid input";
}

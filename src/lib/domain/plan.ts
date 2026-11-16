import "server-only";
import { q } from "../db";
import type { ISODate } from "../dates";
import { srpe } from "../stats/load";
import type { TrainingSession } from "./training";

export const PHASE_KINDS = ["base", "build", "peak", "taper", "race", "recovery", "transition"] as const;
export type PhaseKind = (typeof PHASE_KINDS)[number];

export interface PlanPhase {
  id: number;
  name: string;
  kind: PhaseKind;
  start_date: ISODate;
  end_date: ISODate;
  goal: string | null;
  notes: string | null;
}

export interface PlanSession {
  id: number;
  phase_id: number | null;
  date: ISODate;
  sport: string;
  title: string;
  description: string | null;
  intensity: string | null;
  planned_duration_min: number | null;
  planned_distance_km: number | null;
  planned_rpe: number | null;
  ow_workout_id: string | null;
  skipped: boolean;
}

export async function listPhases(athleteId: number, start: ISODate, end: ISODate): Promise<PlanPhase[]> {
  return q<PlanPhase>(
    `SELECT id, name, kind, start_date, end_date, goal, notes FROM plan_phase
     WHERE athlete_id = $1 AND start_date <= $3 AND end_date >= $2 ORDER BY start_date`,
    [athleteId, start, end],
  );
}

export async function listAllPhases(athleteId: number): Promise<PlanPhase[]> {
  return q<PlanPhase>(
    "SELECT id, name, kind, start_date, end_date, goal, notes FROM plan_phase WHERE athlete_id = $1 ORDER BY start_date",
    [athleteId],
  );
}

export async function listPlanSessions(athleteId: number, start: ISODate, end: ISODate): Promise<PlanSession[]> {
  return q<PlanSession>(
    `SELECT id, phase_id, date, sport, title, description, intensity, planned_duration_min, planned_distance_km,
            planned_rpe, ow_workout_id, skipped
     FROM plan_session WHERE athlete_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date, id`,
    [athleteId, start, end],
  );
}

export function plannedLoad(s: PlanSession): number | null {
  return s.planned_rpe != null && s.planned_duration_min != null ? srpe(s.planned_rpe, s.planned_duration_min) : null;
}

export interface PlanMatch {
  plan: PlanSession;
  actual: TrainingSession | null;
  /** 'linked' = explicit link; 'auto' = same day and sport family. */
  how: "linked" | "auto" | null;
}

/**
 * Pair planned sessions with what was done. Explicit links win; remaining
 * sessions match the longest unclaimed session of the same sport family on the
 * same day. An actual session is used at most once.
 */
export function matchPlan(plan: PlanSession[], all: TrainingSession[]): { matches: PlanMatch[]; unplanned: TrainingSession[] } {
  const actual = all.filter((a) => !a.excluded);
  const used = new Set<string>();
  const matches: PlanMatch[] = plan.map((p) => ({ plan: p, actual: null, how: null }));
  for (const m of matches) {
    const p = m.plan;
    const byManual = actual.find((a) => a.manual?.plan_session_id === p.id || a.annotation?.plan_session_id === p.id);
    const byWorkout = p.ow_workout_id ? actual.find((a) => a.recordings.some((r) => r.id === p.ow_workout_id)) : undefined;
    const hit = byManual ?? byWorkout;
    if (hit && !used.has(hit.key)) { m.actual = hit; m.how = "linked"; used.add(hit.key); }
  }
  for (const m of matches) {
    if (m.actual || m.plan.skipped) continue;
    const candidates = actual
      .filter((a) => !used.has(a.key) && a.date === m.plan.date && a.family === m.plan.sport)
      .sort((a, b) => (b.durationMin ?? 0) - (a.durationMin ?? 0));
    if (candidates[0]) { m.actual = candidates[0]; m.how = "auto"; used.add(candidates[0].key); }
  }
  return { matches, unplanned: actual.filter((a) => !used.has(a.key)) };
}

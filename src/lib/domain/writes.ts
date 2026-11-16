import "server-only";
import { q, q1 } from "../db";
import type { AnnotationInput, ManualSessionInput, PhaseInput, PlanSessionInput } from "./inputs";

// All writes that more than one client performs. Callers validate with the
// schemas in inputs.ts first; every statement is scoped to the athlete.

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = "NotFoundError";
  }
}

// ---------- training ----------

/** Create or update the annotation (RPE, notes, exclusion, plan link) on a device workout. */
export async function upsertAnnotation(athleteId: number, a: AnnotationInput): Promise<void> {
  // Fields left undefined keep their stored value, so a one-field update (an
  // RPE tap) never wipes notes or the plan link.
  await q(
    `INSERT INTO manual_session (athlete_id, date, start_time, sport, title, duration_min, rpe, ow_workout_id, plan_session_id, notes, excluded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,COALESCE($11,false))
     ON CONFLICT (athlete_id, ow_workout_id) WHERE ow_workout_id IS NOT NULL DO UPDATE SET
       rpe = CASE WHEN $12 THEN EXCLUDED.rpe ELSE manual_session.rpe END,
       title = CASE WHEN $13 THEN EXCLUDED.title ELSE manual_session.title END,
       notes = CASE WHEN $14 THEN EXCLUDED.notes ELSE manual_session.notes END,
       plan_session_id = CASE WHEN $15 THEN EXCLUDED.plan_session_id ELSE manual_session.plan_session_id END,
       excluded = CASE WHEN $16 THEN EXCLUDED.excluded ELSE manual_session.excluded END,
       updated_at = now()`,
    [athleteId, a.date, a.startTime || null, a.sport, a.title ?? null, a.durationMin, a.rpe ?? null, a.owWorkoutId,
      a.planSessionId ?? null, a.notes ?? null, a.excluded ?? null,
      a.rpe !== undefined, a.title !== undefined, a.notes !== undefined, a.planSessionId !== undefined, a.excluded !== undefined],
  );
}

export async function setManualRpe(athleteId: number, id: number, rpe: number | null): Promise<void> {
  const row = await q1("UPDATE manual_session SET rpe = $1, updated_at = now() WHERE id = $2 AND athlete_id = $3 RETURNING id", [rpe, id, athleteId]);
  if (!row) throw new NotFoundError("session");
}

export async function createManualSession(athleteId: number, m: ManualSessionInput): Promise<number> {
  const row = await q1<{ id: number }>(
    `INSERT INTO manual_session (athlete_id, date, sport, title, duration_min, distance_km, rpe, plan_session_id, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [athleteId, m.date, m.sport, m.title ?? null, m.durationMin, m.distanceKm ?? null, m.rpe ?? null, m.planSessionId ?? null, m.notes ?? null],
  );
  return row!.id;
}

export async function updateManualSession(athleteId: number, id: number, m: ManualSessionInput): Promise<void> {
  const row = await q1(
    `UPDATE manual_session SET date=$2, sport=$3, title=$4, duration_min=$5, distance_km=$6, rpe=$7, plan_session_id=$8, notes=$9, updated_at=now()
     WHERE id=$10 AND athlete_id=$1 AND ow_workout_id IS NULL RETURNING id`,
    [athleteId, m.date, m.sport, m.title ?? null, m.durationMin, m.distanceKm ?? null, m.rpe ?? null, m.planSessionId ?? null, m.notes ?? null, id],
  );
  if (!row) throw new NotFoundError("manual session");
}

export async function deleteManualSession(athleteId: number, id: number): Promise<void> {
  const row = await q1("DELETE FROM manual_session WHERE id = $1 AND athlete_id = $2 RETURNING id", [id, athleteId]);
  if (!row) throw new NotFoundError("manual session");
}

// ---------- plan ----------

async function phaseFor(athleteId: number, date: string): Promise<number | null> {
  // Sessions attach to the phase covering their date, so phases are never picked by hand.
  const p = await q1<{ id: number }>(
    "SELECT id FROM plan_phase WHERE athlete_id = $1 AND $2 BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1",
    [athleteId, date],
  );
  return p?.id ?? null;
}

export async function createPlanSession(athleteId: number, s: PlanSessionInput): Promise<number> {
  const row = await q1<{ id: number }>(
    `INSERT INTO plan_session (athlete_id, phase_id, date, sport, title, description, intensity, planned_duration_min,
       planned_distance_km, planned_rpe, ow_workout_id, skipped)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id`,
    [athleteId, await phaseFor(athleteId, s.date), s.date, s.sport, s.title, s.description ?? null, s.intensity ?? null,
      s.plannedDurationMin ?? null, s.plannedDistanceKm ?? null, s.plannedRpe ?? null, s.owWorkoutId ?? null, s.skipped],
  );
  return row!.id;
}

export async function updatePlanSession(athleteId: number, id: number, s: PlanSessionInput): Promise<void> {
  const row = await q1(
    `UPDATE plan_session SET phase_id=$2, date=$3, sport=$4, title=$5, description=$6, intensity=$7, planned_duration_min=$8,
       planned_distance_km=$9, planned_rpe=$10, ow_workout_id=$11, skipped=$12, updated_at=now()
     WHERE id=$13 AND athlete_id=$1 RETURNING id`,
    [athleteId, await phaseFor(athleteId, s.date), s.date, s.sport, s.title, s.description ?? null, s.intensity ?? null,
      s.plannedDurationMin ?? null, s.plannedDistanceKm ?? null, s.plannedRpe ?? null, s.owWorkoutId ?? null, s.skipped, id],
  );
  if (!row) throw new NotFoundError("planned session");
}

export async function deletePlanSession(athleteId: number, id: number): Promise<void> {
  const row = await q1("DELETE FROM plan_session WHERE id = $1 AND athlete_id = $2 RETURNING id", [id, athleteId]);
  if (!row) throw new NotFoundError("planned session");
}

/** Copy one Monday-start week of planned sessions forward by N weeks. Returns rows created. */
export async function copyPlanWeek(athleteId: number, weekStart: string, weeks: number): Promise<number> {
  const rows = await q(
    `INSERT INTO plan_session (athlete_id, phase_id, date, sport, title, description, intensity, planned_duration_min, planned_distance_km, planned_rpe)
     SELECT ps.athlete_id,
            (SELECT id FROM plan_phase ph WHERE ph.athlete_id = ps.athlete_id AND (ps.date + 7 * $3::int) BETWEEN ph.start_date AND ph.end_date ORDER BY ph.start_date DESC LIMIT 1),
            ps.date + 7 * $3::int, ps.sport, ps.title, ps.description, ps.intensity, ps.planned_duration_min, ps.planned_distance_km, ps.planned_rpe
     FROM plan_session ps WHERE ps.athlete_id = $1 AND ps.date BETWEEN $2::date AND $2::date + 6
     RETURNING id`,
    [athleteId, weekStart, weeks],
  );
  return rows.length;
}

async function reattachSessions(athleteId: number): Promise<void> {
  // Phase edits can move boundaries; re-file every session under the phase now covering it.
  await q(
    `UPDATE plan_session ps SET phase_id = (SELECT id FROM plan_phase ph WHERE ph.athlete_id = ps.athlete_id
       AND ps.date BETWEEN ph.start_date AND ph.end_date ORDER BY ph.start_date DESC LIMIT 1)
     WHERE ps.athlete_id = $1`,
    [athleteId],
  );
}

export async function createPhase(athleteId: number, p: PhaseInput): Promise<number> {
  const row = await q1<{ id: number }>(
    "INSERT INTO plan_phase (athlete_id, name, kind, start_date, end_date, goal, notes) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id",
    [athleteId, p.name, p.kind, p.startDate, p.endDate, p.goal ?? null, p.notes ?? null],
  );
  await reattachSessions(athleteId);
  return row!.id;
}

export async function updatePhase(athleteId: number, id: number, p: PhaseInput): Promise<void> {
  const row = await q1(
    "UPDATE plan_phase SET name=$2, kind=$3, start_date=$4, end_date=$5, goal=$6, notes=$7 WHERE id=$8 AND athlete_id=$1 RETURNING id",
    [athleteId, p.name, p.kind, p.startDate, p.endDate, p.goal ?? null, p.notes ?? null, id],
  );
  if (!row) throw new NotFoundError("phase");
  await reattachSessions(athleteId);
}

export async function deletePhase(athleteId: number, id: number): Promise<void> {
  const row = await q1("DELETE FROM plan_phase WHERE id = $1 AND athlete_id = $2 RETURNING id", [id, athleteId]);
  if (!row) throw new NotFoundError("phase");
}

// ---------- questionnaires / athlete ----------

export async function setQuestionnaireActive(athleteId: number, slug: string, active: boolean): Promise<void> {
  const row = await q1("UPDATE questionnaire_def SET active = $1, updated_at = now() WHERE athlete_id = $2 AND slug = $3 RETURNING id", [active, athleteId, slug]);
  if (!row) throw new NotFoundError("questionnaire");
}

export async function renameAthlete(athleteId: number, name: string): Promise<void> {
  await q("UPDATE athlete SET name = $1 WHERE id = $2", [name.trim().slice(0, 80), athleteId]);
}

export async function linkOwUser(athleteId: number, owUserId: string): Promise<void> {
  await q("UPDATE athlete SET ow_user_id = $1 WHERE id = $2", [owUserId, athleteId]);
}

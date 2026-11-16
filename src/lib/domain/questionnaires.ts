import "server-only";
import { q, q1, tx } from "../db";
import { addDays, type ISODate } from "../dates";
import { ItemsSchema, wellnessScores, type Answer, type DefInput, type Item } from "./questionnaire-schema";

export interface QuestionnaireDef {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  kind: "wellness" | "custom";
  schedule: "daily" | "weekly" | "adhoc";
  items: Item[];
  version: number;
  active: boolean;
}

export interface QuestionnaireResponse {
  id: number;
  def_id: number;
  date: ISODate;
  def_version: number;
  items_snapshot: Item[];
  answers: Record<string, Answer>;
  submitted_at: string;
}

const DEF_COLS = "id, slug, name, description, kind, schedule, items, version, active";

export async function listDefs(athleteId: number, includeInactive = false): Promise<QuestionnaireDef[]> {
  return q<QuestionnaireDef>(
    `SELECT ${DEF_COLS} FROM questionnaire_def WHERE athlete_id = $1 ${includeInactive ? "" : "AND active"} ORDER BY kind DESC, name`,
    [athleteId],
  );
}

export async function getDef(athleteId: number, slug: string): Promise<QuestionnaireDef | null> {
  return q1<QuestionnaireDef>(`SELECT ${DEF_COLS} FROM questionnaire_def WHERE athlete_id = $1 AND slug = $2`, [athleteId, slug]);
}

export async function upsertDef(athleteId: number, d: DefInput, active = true): Promise<QuestionnaireDef> {
  const items = ItemsSchema.parse(d.items);
  // Bump the version only when the items change, so old responses keep the
  // snapshot of what was actually asked.
  const row = await q1<QuestionnaireDef>(
    `INSERT INTO questionnaire_def (athlete_id, slug, name, description, kind, schedule, items, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
     ON CONFLICT (athlete_id, slug) DO UPDATE SET
       name = EXCLUDED.name, description = EXCLUDED.description, kind = EXCLUDED.kind,
       schedule = EXCLUDED.schedule, active = EXCLUDED.active, updated_at = now(),
       version = questionnaire_def.version + CASE WHEN questionnaire_def.items = EXCLUDED.items THEN 0 ELSE 1 END,
       items = EXCLUDED.items
     RETURNING ${DEF_COLS}`,
    [athleteId, d.slug, d.name, d.description ?? null, d.kind, d.schedule, JSON.stringify(items), active],
  );
  return row!;
}

export async function getResponse(defId: number, date: ISODate): Promise<QuestionnaireResponse | null> {
  return q1<QuestionnaireResponse>(
    "SELECT id, def_id, date, def_version, items_snapshot, answers, submitted_at FROM questionnaire_response WHERE def_id = $1 AND date = $2",
    [defId, date],
  );
}

export async function listResponses(athleteId: number, defId: number, start: ISODate, end: ISODate): Promise<QuestionnaireResponse[]> {
  return q<QuestionnaireResponse>(
    `SELECT id, def_id, date, def_version, items_snapshot, answers, submitted_at FROM questionnaire_response
     WHERE athlete_id = $1 AND def_id = $2 AND date BETWEEN $3 AND $4 ORDER BY date`,
    [athleteId, defId, start, end],
  );
}

export async function submitResponse(athleteId: number, def: QuestionnaireDef, date: ISODate, answers: Record<string, Answer>): Promise<void> {
  await tx(async (c) => {
    const { rows } = await c.query<{ id: number }>(
      `INSERT INTO questionnaire_response (def_id, athlete_id, date, def_version, items_snapshot, answers)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (def_id, date) DO UPDATE SET def_version = EXCLUDED.def_version,
         items_snapshot = EXCLUDED.items_snapshot, answers = EXCLUDED.answers, submitted_at = now()
       RETURNING id`,
      [def.id, athleteId, date, def.version, JSON.stringify(def.items), JSON.stringify(answers)],
    );
    if (def.kind !== "wellness") return;
    const { itemScores, composite } = wellnessScores(def.items, answers);
    if (composite == null) return;
    await c.query(
      `INSERT INTO daily_wellness (athlete_id, date, response_id, item_scores, composite, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (athlete_id, date) DO UPDATE SET response_id = EXCLUDED.response_id,
         item_scores = EXCLUDED.item_scores, composite = EXCLUDED.composite, updated_at = now()`,
      [athleteId, date, rows[0].id, JSON.stringify(itemScores), composite],
    );
  });
}

export interface WellnessDay {
  date: ISODate;
  composite: number;
  item_scores: Record<string, number>;
}

export async function listWellness(athleteId: number, start: ISODate, end: ISODate): Promise<WellnessDay[]> {
  return q<WellnessDay>(
    "SELECT date, composite, item_scores FROM daily_wellness WHERE athlete_id = $1 AND date BETWEEN $2 AND $3 ORDER BY date",
    [athleteId, start, end],
  );
}

/** Consecutive days up to `today` (or yesterday, if today is not yet answered) with a response. */
export async function streak(defId: number, today: ISODate): Promise<number> {
  const rows = await q<{ date: ISODate }>(
    "SELECT date FROM questionnaire_response WHERE def_id = $1 AND date <= $2 AND date > $3 ORDER BY date DESC",
    [defId, today, addDays(today, -400)],
  );
  const have = new Set(rows.map((r) => r.date));
  let d = have.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (have.has(d)) { n++; d = addDays(d, -1); }
  return n;
}

/** Is the form due on `date`? Weekly forms are due once per Monday-start week. */
export async function isDue(def: QuestionnaireDef, date: ISODate, weekStart: ISODate): Promise<boolean> {
  if (def.schedule === "adhoc") return false;
  if (def.schedule === "daily") return !(await getResponse(def.id, date));
  const r = await q1<{ n: number }>(
    "SELECT count(*)::int AS n FROM questionnaire_response WHERE def_id = $1 AND date BETWEEN $2 AND $3",
    [def.id, weekStart, addDays(weekStart, 6)],
  );
  return (r?.n ?? 0) === 0;
}

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { q, q1 } from "@/lib/db";
import { isISODate } from "@/lib/dates";
import { getCtx } from "@/lib/domain/context";
import { DefSchema, validateAnswers } from "@/lib/domain/questionnaire-schema";
import { getDef, submitResponse, upsertDef } from "@/lib/domain/questionnaires";
import { PHASE_KINDS } from "@/lib/domain/plan";
import { saveSettings, SettingsSchema, METRICS } from "@/lib/settings";
import { SPORT_FAMILIES } from "@/lib/sports";
import { invalidate } from "@/lib/cache";
import { authorizeUrl, bootstrapApplication, createUser, getUser, syncProvider } from "@/lib/ow/api";
import { errorMessage } from "@/lib/domain/errors";

// ---------- helpers ----------

function str(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}
function num(fd: FormData, k: string): number | null {
  const v = str(fd, k);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function date(fd: FormData, k: string): string {
  const v = str(fd, k);
  if (!isISODate(v)) throw new Error(`Invalid date for ${k}`);
  return v;
}
/** Same-site relative paths only, so a form can't redirect off-site. */
function back(fd: FormData, fallback: string): string {
  const v = str(fd, "back");
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}
function withParam(path: string, k: string, v: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
}
function rpe(fd: FormData): number | null {
  const v = num(fd, "rpe");
  if (v == null) return null;
  if (v < 0 || v > 10) throw new Error("RPE must be 0-10");
  return v;
}
function done(path = "/") {
  revalidatePath("/", "layout");
  return path;
}

// ---------- training ----------

/** Create or update the annotation (RPE, notes, exclusion, plan link) on a device workout. */
export async function annotateWorkout(fd: FormData) {
  const { athlete } = await getCtx();
  const workoutId = str(fd, "ow_workout_id");
  if (!workoutId) throw new Error("Missing workout id");
  const sport = str(fd, "sport") ?? "other";
  await q(
    `INSERT INTO manual_session (athlete_id, date, start_time, sport, title, duration_min, rpe, ow_workout_id, plan_session_id, notes, excluded)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT (athlete_id, ow_workout_id) WHERE ow_workout_id IS NOT NULL DO UPDATE SET
       rpe = EXCLUDED.rpe, title = EXCLUDED.title, notes = EXCLUDED.notes, plan_session_id = EXCLUDED.plan_session_id,
       excluded = EXCLUDED.excluded, updated_at = now()`,
    [athlete.id, date(fd, "date"), str(fd, "start_time"), sport, str(fd, "title"), num(fd, "duration_min") ?? 0, rpe(fd),
      workoutId, num(fd, "plan_session_id"), str(fd, "notes"), fd.get("excluded") === "on"],
  );
  redirect(done(back(fd, "/history")));
}

/** One-field RPE rating from a table row; keeps any existing annotation fields. */
export async function rateSession(fd: FormData) {
  const { athlete } = await getCtx();
  const key = str(fd, "key") ?? "";
  const value = rpe(fd);
  if (key.startsWith("manual:")) {
    await q("UPDATE manual_session SET rpe = $1, updated_at = now() WHERE id = $2 AND athlete_id = $3", [value, Number(key.slice(7)), athlete.id]);
  } else if (key.startsWith("ow:")) {
    await q(
      `INSERT INTO manual_session (athlete_id, date, start_time, sport, duration_min, rpe, ow_workout_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (athlete_id, ow_workout_id) WHERE ow_workout_id IS NOT NULL DO UPDATE SET rpe = EXCLUDED.rpe, updated_at = now()`,
      [athlete.id, date(fd, "date"), str(fd, "start_time"), str(fd, "sport") ?? "other", num(fd, "duration_min") ?? 0, value, key.slice(3)],
    );
  }
  redirect(done(back(fd, "/history")));
}

export async function logManualSession(fd: FormData) {
  const { athlete } = await getCtx();
  const sport = str(fd, "sport") ?? "other";
  if (!(SPORT_FAMILIES as readonly string[]).includes(sport)) throw new Error("Unknown sport");
  const duration = num(fd, "duration_min");
  if (duration == null || duration <= 0) redirect(withParam(back(fd, "/history"), "error", "Enter a duration in minutes."));
  const id = num(fd, "id");
  const vals = [athlete.id, date(fd, "date"), sport, str(fd, "title"), duration, num(fd, "distance_km"), rpe(fd), num(fd, "plan_session_id"), str(fd, "notes")];
  if (id) {
    await q(
      `UPDATE manual_session SET date=$2, sport=$3, title=$4, duration_min=$5, distance_km=$6, rpe=$7, plan_session_id=$8, notes=$9, updated_at=now()
       WHERE id=$10 AND athlete_id=$1 AND ow_workout_id IS NULL`,
      [...vals, id],
    );
  } else {
    await q(
      `INSERT INTO manual_session (athlete_id, date, sport, title, duration_min, distance_km, rpe, plan_session_id, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      vals,
    );
  }
  redirect(done(withParam(back(fd, "/history"), "saved", "1")));
}

export async function deleteManualSession(fd: FormData) {
  const { athlete } = await getCtx();
  await q("DELETE FROM manual_session WHERE id = $1 AND athlete_id = $2", [num(fd, "id"), athlete.id]);
  redirect(done(back(fd, "/history")));
}

// ---------- plan ----------

export async function savePlanSession(fd: FormData) {
  const { athlete } = await getCtx();
  const sport = str(fd, "sport") ?? "other";
  if (!(SPORT_FAMILIES as readonly string[]).includes(sport)) throw new Error("Unknown sport");
  const title = str(fd, "title");
  if (!title) redirect(withParam(back(fd, "/plan"), "error", "Give the session a title."));
  const id = num(fd, "id");
  const d = date(fd, "date");
  // Attach to the phase covering the date, so phases needn't be picked by hand.
  const phase = await q1<{ id: number }>(
    "SELECT id FROM plan_phase WHERE athlete_id = $1 AND $2 BETWEEN start_date AND end_date ORDER BY start_date DESC LIMIT 1",
    [athlete.id, d],
  );
  const vals = [athlete.id, phase?.id ?? null, d, sport, title, str(fd, "description"), str(fd, "intensity"),
    num(fd, "planned_duration_min"), num(fd, "planned_distance_km"), (() => { const v = num(fd, "planned_rpe"); if (v != null && (v < 0 || v > 10)) throw new Error("RPE must be 0-10"); return v; })(),
    str(fd, "ow_workout_id"), fd.get("skipped") === "on"];
  if (id) {
    await q(
      `UPDATE plan_session SET phase_id=$2, date=$3, sport=$4, title=$5, description=$6, intensity=$7, planned_duration_min=$8,
         planned_distance_km=$9, planned_rpe=$10, ow_workout_id=$11, skipped=$12, updated_at=now()
       WHERE id=$13 AND athlete_id=$1`,
      [...vals, id],
    );
  } else {
    await q(
      `INSERT INTO plan_session (athlete_id, phase_id, date, sport, title, description, intensity, planned_duration_min,
         planned_distance_km, planned_rpe, ow_workout_id, skipped)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      vals,
    );
  }
  redirect(done(back(fd, `/plan?month=${d.slice(0, 7)}`)));
}

export async function deletePlanSession(fd: FormData) {
  const { athlete } = await getCtx();
  await q("DELETE FROM plan_session WHERE id = $1 AND athlete_id = $2", [num(fd, "id"), athlete.id]);
  redirect(done(back(fd, "/plan")));
}

/** Copy a week of planned sessions forward by N weeks. */
export async function copyPlanWeek(fd: FormData) {
  const { athlete } = await getCtx();
  const from = date(fd, "week_start");
  const weeks = Math.max(1, Math.min(12, num(fd, "weeks") ?? 1));
  await q(
    `INSERT INTO plan_session (athlete_id, phase_id, date, sport, title, description, intensity, planned_duration_min, planned_distance_km, planned_rpe)
     SELECT ps.athlete_id,
            (SELECT id FROM plan_phase ph WHERE ph.athlete_id = ps.athlete_id AND (ps.date + 7 * $3::int) BETWEEN ph.start_date AND ph.end_date ORDER BY ph.start_date DESC LIMIT 1),
            ps.date + 7 * $3::int, ps.sport, ps.title, ps.description, ps.intensity, ps.planned_duration_min, ps.planned_distance_km, ps.planned_rpe
     FROM plan_session ps WHERE ps.athlete_id = $1 AND ps.date BETWEEN $2::date AND $2::date + 6`,
    [athlete.id, from, weeks],
  );
  redirect(done(back(fd, "/plan")));
}

export async function savePhase(fd: FormData) {
  const { athlete } = await getCtx();
  const kind = str(fd, "kind") ?? "build";
  if (!(PHASE_KINDS as readonly string[]).includes(kind)) throw new Error("Unknown phase kind");
  const name = str(fd, "name");
  const start = date(fd, "start_date");
  const end = date(fd, "end_date");
  if (!name || end < start) redirect(withParam(back(fd, "/plan/phases"), "error", !name ? "Name the phase." : "End date must be on or after the start date."));
  const id = num(fd, "id");
  const vals = [athlete.id, name, kind, start, end, str(fd, "goal"), str(fd, "notes")];
  if (id) {
    await q("UPDATE plan_phase SET name=$2, kind=$3, start_date=$4, end_date=$5, goal=$6, notes=$7 WHERE id=$8 AND athlete_id=$1", [...vals, id]);
  } else {
    await q("INSERT INTO plan_phase (athlete_id, name, kind, start_date, end_date, goal, notes) VALUES ($1,$2,$3,$4,$5,$6,$7)", vals);
  }
  // Re-attach sessions to whichever phase now covers their date.
  await q(
    `UPDATE plan_session ps SET phase_id = (SELECT id FROM plan_phase ph WHERE ph.athlete_id = ps.athlete_id
       AND ps.date BETWEEN ph.start_date AND ph.end_date ORDER BY ph.start_date DESC LIMIT 1)
     WHERE ps.athlete_id = $1`,
    [athlete.id],
  );
  redirect(done(back(fd, "/plan/phases")));
}

export async function deletePhase(fd: FormData) {
  const { athlete } = await getCtx();
  await q("DELETE FROM plan_phase WHERE id = $1 AND athlete_id = $2", [num(fd, "id"), athlete.id]);
  redirect(done(back(fd, "/plan/phases")));
}

// ---------- questionnaires ----------

export interface SubmitState {
  errors: Record<string, string>;
  values: Record<string, string>;
  saved?: boolean;
}

export async function submitQuestionnaire(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const { athlete } = await getCtx();
  const slug = str(fd, "slug") ?? "";
  const def = await getDef(athlete.id, slug);
  if (!def) return { errors: { _form: "This questionnaire no longer exists." }, values: {} };
  const raw: Record<string, unknown> = {};
  const values: Record<string, string> = {};
  for (const it of def.items) {
    const v = fd.get(`a_${it.key}`);
    raw[it.key] = typeof v === "string" ? v : null;
    if (typeof v === "string") values[it.key] = v;
  }
  const d = str(fd, "date");
  if (!isISODate(d)) return { errors: { _form: "Pick a valid date." }, values };
  const { answers, errors } = validateAnswers(def.items, raw);
  if (Object.keys(errors).length) return { errors, values };
  await submitResponse(athlete.id, def, d, answers);
  revalidatePath("/", "layout");
  return { errors: {}, values, saved: true };
}

export interface DefState {
  error: string | null;
  text: string;
}

export async function saveQuestionnaireDef(_prev: DefState, fd: FormData): Promise<DefState> {
  const { athlete } = await getCtx();
  const text = String(fd.get("json") ?? "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { error: `That isn't valid JSON: ${(e as Error).message}`, text };
  }
  const res = DefSchema.safeParse(parsed);
  if (!res.success) {
    return { error: res.error.issues.map((i) => `${i.path.join(".") || "form"}: ${i.message}`).join("\n"), text };
  }
  const active = fd.get("active") !== "off";
  await upsertDef(athlete.id, res.data, active);
  revalidatePath("/", "layout");
  redirect(`/wellness?saved=${encodeURIComponent(res.data.slug)}`);
}

export async function setQuestionnaireActive(fd: FormData) {
  const { athlete } = await getCtx();
  await q("UPDATE questionnaire_def SET active = $1, updated_at = now() WHERE athlete_id = $2 AND slug = $3", [fd.get("active") === "true", athlete.id, str(fd, "slug")]);
  redirect(done("/wellness"));
}

// ---------- settings ----------

const SettingsForm = SettingsSchema.pick({ timezone: true, ow: true, hrv: true, baselines: true, load: true, matching: true, compare: true, readiness: true, training: true });

// Fields that are comma-separated lists in the form.
const LIST_FIELDS = new Set(["training.excludeTypes"]);
// Checkbox fields: absent from FormData when unchecked, so default them to false.
const BOOL_FIELDS = ["ow.includeRedundantRelays", "load.trimpFallback"];

/** Form fields named like "hrv.rollingDays" become nested settings, then the schema validates them. */
export async function updateSettings(fd: FormData) {
  const ctx = await getCtx();
  const out: Record<string, Record<string, unknown> | unknown> = {};
  const set = (path: string, v: unknown) => {
    const parts = path.split(".");
    let o = out as Record<string, unknown>;
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    o[parts.at(-1)!] = v;
  };
  for (const b of BOOL_FIELDS) set(b, false);
  for (const [k, raw] of fd.entries()) {
    if (k.startsWith("$") || typeof raw !== "string") continue;
    const v = raw.trim();
    if (LIST_FIELDS.has(k)) set(k, v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
    else if (BOOL_FIELDS.includes(k)) set(k, raw === "on");
    else if (k === "timezone" || k.startsWith("load.method") || k.startsWith("load.acwrModel") || k.startsWith("load.trimpSex")) set(k, v);
    else if (v !== "" && Number.isFinite(Number(v))) set(k, Number(v));
  }
  // Merge sections over current values so a partial form never resets the rest.
  const cur = ctx.settings as unknown as Record<string, unknown>;
  const merged: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(out)) {
    merged[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(cur[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  const parsed = SettingsForm.partial().safeParse(merged);
  if (!parsed.success) {
    redirect(withParam("/settings", "error", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")));
  }
  if (parsed.data.timezone) {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: parsed.data.timezone });
    } catch {
      redirect(withParam("/settings", "error", "Unknown timezone. Use an IANA name like America/New_York."));
    }
  }
  await saveSettings(ctx.athlete.id, parsed.data);
  invalidate("ow:");
  redirect(done("/settings?saved=1"));
}

function deepMerge(a: Record<string, unknown> | undefined, b: Record<string, unknown>): Record<string, unknown> {
  const o: Record<string, unknown> = { ...(a ?? {}) };
  for (const [k, v] of Object.entries(b)) {
    o[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(o[k] as Record<string, unknown>, v as Record<string, unknown>) : v;
  }
  return o;
}

export async function updateDevicePriority(fd: FormData) {
  const { athlete } = await getCtx();
  const metric = str(fd, "metric");
  if (!metric || !(METRICS as readonly string[]).includes(metric)) throw new Error("Unknown metric");
  const order = z.array(z.string().max(200)).max(100).parse(JSON.parse(String(fd.get("order") ?? "[]")));
  const ctx = await getCtx();
  await saveSettings(athlete.id, { devicePriority: { ...ctx.settings.devicePriority, [metric]: order } });
  redirect(done(`/settings/devices?metric=${metric}&saved=1`));
}

export async function toggleTrainingDeviceExcluded(fd: FormData) {
  const ctx = await getCtx();
  const key = str(fd, "device");
  if (!key) throw new Error("Missing device");
  const cur = new Set(ctx.settings.training.excludeDevices);
  if (cur.has(key)) cur.delete(key); else cur.add(key);
  await saveSettings(ctx.athlete.id, { training: { ...ctx.settings.training, excludeDevices: [...cur] } });
  redirect(done(back(fd, "/settings/devices?metric=workouts")));
}

// ---------- Open Wearables ----------

export async function linkOwUser(fd: FormData) {
  const { athlete } = await getCtx();
  const id = str(fd, "ow_user_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect("/settings/connections?error=" + encodeURIComponent("Pick a user from the list."));
  try {
    await getUser(id);
  } catch (e) {
    redirect("/settings/connections?error=" + encodeURIComponent(errorMessage(e)));
  }
  await q("UPDATE athlete SET ow_user_id = $1 WHERE id = $2", [id, athlete.id]);
  invalidate("ow:");
  redirect(done("/settings/connections?linked=1"));
}

export async function createAndLinkOwUser(fd: FormData) {
  const { athlete } = await getCtx();
  let id: string;
  try {
    const u = await createUser(str(fd, "first_name") ?? athlete.name, str(fd, "last_name") ?? "");
    id = u.id;
  } catch (e) {
    redirect("/settings/connections?error=" + encodeURIComponent(errorMessage(e)));
  }
  await q("UPDATE athlete SET ow_user_id = $1 WHERE id = $2", [id, athlete.id]);
  redirect(done("/settings/connections?linked=1"));
}

export async function renameAthlete(fd: FormData) {
  const { athlete } = await getCtx();
  const name = str(fd, "name");
  if (name) await q("UPDATE athlete SET name = $1 WHERE id = $2", [name.slice(0, 80), athlete.id]);
  redirect(done("/settings"));
}

export async function bootstrapOwApplication() {
  let msg: string;
  try {
    const r = await bootstrapApplication();
    msg = r.created ? "app=created" : "app=exists";
  } catch (e) {
    msg = "error=" + encodeURIComponent(errorMessage(e));
  }
  redirect(done(`/settings/connections?${msg}`));
}

export async function connectProvider(fd: FormData) {
  const ctx = await getCtx();
  const provider = str(fd, "provider");
  const origin = str(fd, "origin");
  if (!ctx.athlete.ow_user_id || !provider || !origin) redirect("/settings/connections?error=" + encodeURIComponent("Link an Open Wearables user first."));
  let url: string;
  try {
    url = await authorizeUrl(provider, ctx.athlete.ow_user_id, `${origin}/settings/connections?connected=${encodeURIComponent(provider)}`);
  } catch (e) {
    redirect("/settings/connections?error=" + encodeURIComponent(errorMessage(e)));
  }
  redirect(url);
}

export async function syncNow(fd: FormData) {
  const ctx = await getCtx();
  const provider = str(fd, "provider");
  if (!ctx.ow || !provider) redirect("/settings/connections");
  let msg = `synced=${encodeURIComponent(provider)}`;
  try {
    await syncProvider(ctx.ow, provider);
  } catch (e) {
    msg = "error=" + encodeURIComponent(errorMessage(e));
  }
  invalidate(`ow:${ctx.ow.userId}`);
  redirect(done(`/settings/connections?${msg}`));
}

export async function refreshDeviceData() {
  const ctx = await getCtx();
  invalidate(ctx.ow ? `ow:${ctx.ow.userId}` : "ow:");
  redirect(done("/"));
}

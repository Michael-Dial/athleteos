"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { getCtx, type AppCtx } from "@/lib/domain/context";
import { requireAdmin, requireUser } from "@/lib/current-user";
import { markOnboarded, userById, type User } from "@/lib/users";
import { DefSchema, validateAnswers } from "@/lib/domain/questionnaire-schema";
import { getDef, submitResponse, upsertDef } from "@/lib/domain/questionnaires";
import { patchSettings, METRICS } from "@/lib/settings";
import { AnnotationInput, CopyWeekInput, ManualSessionInput, PhaseInput, PlanSessionInput, firstIssue } from "@/lib/domain/inputs";
import * as W from "@/lib/domain/writes";
import {
  createManualSession, createPhase, createPlanSession, setManualRpe, updateManualSession, updatePhase, updatePlanSession, upsertAnnotation,
} from "@/lib/domain/writes";
import { invalidate } from "@/lib/cache";
import { authorizeUrl, bootstrapApplication, createUser, getUser, syncProvider } from "@/lib/ow/api";
import { ensureOwUser } from "@/lib/ow/provision";
import { PHONE_CODE_RE, setPhoneApp, setPhoneCode } from "@/lib/domain/phone-code";
import { errorMessage } from "@/lib/domain/errors";
import { issueToken, revokeToken } from "@/lib/api/tokens";
import { parsePace } from "@/lib/zones";

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
/** Same-site relative paths only, so a form can't redirect off-site. */
function back(fd: FormData, fallback: string): string {
  const v = str(fd, "back");
  return v && v.startsWith("/") && !v.startsWith("//") ? v : fallback;
}
function withParam(path: string, k: string, v: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
}
function done(path = "/") {
  revalidatePath("/", "layout");
  return path;
}

/**
 * Context for a write. An admin viewing someone else's dashboards is read-only:
 * every action refuses rather than quietly writing to either athlete.
 */
async function writeCtx(): Promise<AppCtx> {
  const ctx = await getCtx();
  if (ctx.viewing) redirect("/?readonly=1");
  return ctx;
}

// ---------- training ----------
// Each action converts its form into the shared input schema and calls the
// domain layer, so the web app and the JSON API behave identically.

function parseOr<T>(schema: z.ZodType<T>, obj: unknown, onError: string): T {
  const r = schema.safeParse(obj);
  if (!r.success) redirect(withParam(onError, "error", firstIssue(r.error)));
  return r.data;
}

export async function annotateWorkout(fd: FormData) {
  const { athlete } = await writeCtx();
  const backTo = back(fd, "/history");
  const a = parseOr(AnnotationInput, {
    owWorkoutId: str(fd, "ow_workout_id"), date: str(fd, "date"), startTime: str(fd, "start_time"),
    sport: str(fd, "sport") ?? "other", durationMin: num(fd, "duration_min") ?? 0, rpe: num(fd, "rpe"),
    title: str(fd, "title"), notes: str(fd, "notes"), planSessionId: num(fd, "plan_session_id"), excluded: fd.get("excluded") === "on",
  }, backTo);
  await upsertAnnotation(athlete.id, a);
  redirect(done(backTo));
}

/** One-field RPE rating from a table row; keeps any existing annotation fields. */
export async function rateSession(fd: FormData) {
  const { athlete } = await writeCtx();
  const key = str(fd, "key") ?? "";
  const backTo = back(fd, "/history");
  const value = num(fd, "rpe");
  if (value != null && (value < 0 || value > 10)) redirect(withParam(backTo, "error", "RPE must be 0-10"));
  if (key.startsWith("manual:")) {
    await setManualRpe(athlete.id, Number(key.slice(7)), value);
  } else if (key.startsWith("ow:")) {
    const a = parseOr(AnnotationInput, {
      owWorkoutId: key.slice(3), date: str(fd, "date"), startTime: str(fd, "start_time"),
      sport: str(fd, "sport") ?? "other", durationMin: num(fd, "duration_min") ?? 0, rpe: value,
    }, backTo);
    await upsertAnnotation(athlete.id, a);
  }
  redirect(done(backTo));
}

export async function logManualSession(fd: FormData) {
  const { athlete } = await writeCtx();
  const backTo = back(fd, "/history");
  const m = parseOr(ManualSessionInput, {
    date: str(fd, "date"), sport: str(fd, "sport"), title: str(fd, "title"), durationMin: num(fd, "duration_min"),
    distanceKm: num(fd, "distance_km"), rpe: num(fd, "rpe"), planSessionId: num(fd, "plan_session_id"), notes: str(fd, "notes"),
  }, backTo);
  const id = num(fd, "id");
  if (id) await updateManualSession(athlete.id, id, m);
  else await createManualSession(athlete.id, m);
  redirect(done(withParam(backTo, "saved", "1")));
}

export async function deleteManualSession(fd: FormData) {
  const { athlete } = await writeCtx();
  await W.deleteManualSession(athlete.id, num(fd, "id") ?? 0);
  redirect(done(back(fd, "/history")));
}

// ---------- plan ----------

export async function savePlanSession(fd: FormData) {
  const { athlete } = await writeCtx();
  const backTo = back(fd, "/plan");
  const s = parseOr(PlanSessionInput, {
    date: str(fd, "date"), sport: str(fd, "sport"), title: str(fd, "title") ?? "", description: str(fd, "description"),
    intensity: str(fd, "intensity"), plannedDurationMin: num(fd, "planned_duration_min"), plannedDistanceKm: num(fd, "planned_distance_km"),
    plannedRpe: num(fd, "planned_rpe"), owWorkoutId: str(fd, "ow_workout_id"), skipped: fd.get("skipped") === "on",
  }, backTo);
  const id = num(fd, "id");
  if (id) await updatePlanSession(athlete.id, id, s);
  else await createPlanSession(athlete.id, s);
  redirect(done(back(fd, `/plan?month=${s.date.slice(0, 7)}`)));
}

export async function deletePlanSession(fd: FormData) {
  const { athlete } = await writeCtx();
  await W.deletePlanSession(athlete.id, num(fd, "id") ?? 0);
  redirect(done(back(fd, "/plan")));
}

export async function copyPlanWeek(fd: FormData) {
  const { athlete } = await writeCtx();
  const backTo = back(fd, "/plan");
  const c = parseOr(CopyWeekInput, { weekStart: str(fd, "week_start"), weeks: num(fd, "weeks") ?? 1 }, backTo);
  await W.copyPlanWeek(athlete.id, c.weekStart, c.weeks);
  redirect(done(backTo));
}

export async function savePhase(fd: FormData) {
  const { athlete } = await writeCtx();
  const backTo = back(fd, "/plan/phases");
  const p = parseOr(PhaseInput, {
    name: str(fd, "name") ?? "", kind: str(fd, "kind"), startDate: str(fd, "start_date"), endDate: str(fd, "end_date"),
    goal: str(fd, "goal"), notes: str(fd, "notes"),
  }, backTo);
  const id = num(fd, "id");
  if (id) await updatePhase(athlete.id, id, p);
  else await createPhase(athlete.id, p);
  redirect(done(backTo));
}

export async function deletePhase(fd: FormData) {
  const { athlete } = await writeCtx();
  await W.deletePhase(athlete.id, num(fd, "id") ?? 0);
  redirect(done(back(fd, "/plan/phases")));
}

// ---------- questionnaires ----------

export interface SubmitState {
  errors: Record<string, string>;
  values: Record<string, string>;
  saved?: boolean;
}

export async function submitQuestionnaire(_prev: SubmitState, fd: FormData): Promise<SubmitState> {
  const { athlete } = await writeCtx();
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
  await requireAdmin();
  const { athlete } = await writeCtx();
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
  const { athlete } = await writeCtx();
  await W.setQuestionnaireActive(athlete.id, str(fd, "slug") ?? "", fd.get("active") === "true");
  redirect(done("/wellness"));
}

// ---------- settings ----------

// Fields that are comma-separated lists in the form.
const LIST_FIELDS = new Set(["training.excludeTypes"]);
const TEXT_FIELDS = new Set(["timezone", "load.method", "load.acwrModel", "load.trimpSex", "reminders.morningTime"]);
// Optional numbers: an emptied field means "unset" (null), not "unchanged".
const NULLABLE_FIELDS = new Set(["intensity.lt1Hr", "intensity.lt2Hr"]);

/**
 * Form fields named like "hrv.rollingDays" become a nested patch, validated by
 * the settings schema. Unchecked checkboxes are absent from FormData, so each
 * form lists its own checkboxes in "$bools"; only those default to false.
 */
export async function updateSettings(fd: FormData) {
  const ctx = await writeCtx();
  const backTo = back(fd, "/settings/analysis");
  const patch: Record<string, unknown> = {};
  const set = (path: string, v: unknown) => {
    const parts = path.split(".");
    let o = patch;
    for (const p of parts.slice(0, -1)) o = (o[p] ??= {}) as Record<string, unknown>;
    o[parts.at(-1)!] = v;
  };
  const bools = new Set(String(fd.get("$bools") ?? "").split(",").filter(Boolean));
  for (const b of bools) set(b, false);
  for (const [k, raw] of fd.entries()) {
    if (k.startsWith("$") || k === "back" || typeof raw !== "string") continue;
    const v = raw.trim();
    if (LIST_FIELDS.has(k)) set(k, v ? v.split(",").map((x) => x.trim()).filter(Boolean) : []);
    else if (bools.has(k)) set(k, raw === "on");
    else if (TEXT_FIELDS.has(k)) set(k, v);
    else if (NULLABLE_FIELDS.has(k) && v === "") set(k, null);
    else if (v !== "" && Number.isFinite(Number(v))) set(k, Number(v));
  }
  try {
    // No cache flush: OW cache keys already include the relay flag, and every
    // other knob is applied locally to the cached rows.
    await patchSettings(ctx.athlete.id, patch);
  } catch (e) {
    if (e instanceof z.ZodError) redirect(withParam(backTo, "error", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")));
    throw e;
  }
  redirect(done(withParam(backTo, "saved", "1")));
}

export async function updateDevicePriority(fd: FormData) {
  const { athlete } = await writeCtx();
  const metric = str(fd, "metric");
  if (!metric || !(METRICS as readonly string[]).includes(metric)) throw new Error("Unknown metric");
  const order = z.array(z.string().max(200)).max(100).parse(JSON.parse(String(fd.get("order") ?? "[]")));
  await patchSettings(athlete.id, { devicePriority: { [metric]: order } });
  redirect(done(`/settings/devices?metric=${metric}&saved=1`));
}

export async function toggleTrainingDeviceExcluded(fd: FormData) {
  const ctx = await writeCtx();
  const key = str(fd, "device");
  if (!key) throw new Error("Missing device");
  const cur = new Set(ctx.settings.training.excludeDevices);
  if (cur.has(key)) cur.delete(key); else cur.add(key);
  await patchSettings(ctx.athlete.id, { training: { excludeDevices: [...cur] } });
  redirect(done(back(fd, "/settings/devices?metric=workouts")));
}

// ---------- Open Wearables ----------

/** Admin: the user an admin form acts on, by the hidden user_id field. */
async function targetUser(fd: FormData): Promise<User> {
  await requireAdmin();
  const u = await userById(num(fd, "user_id") ?? 0);
  if (!u) redirect("/settings/users?error=" + encodeURIComponent("That user no longer exists."));
  return u;
}
const userPage = (u: User, q: string) => `/settings/users/${u.id}?${q}`;

/** Admin: attach an existing device-data user (with its history) to this user's athlete. */
export async function linkOwUser(fd: FormData) {
  const target = await targetUser(fd);
  const id = str(fd, "ow_user_id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) redirect(userPage(target, "error=" + encodeURIComponent("Pick an account from the list.")));
  try {
    await getUser(id);
    await W.linkOwUser(target.athlete_id, id);
  } catch (e) {
    redirect(userPage(target, "error=" + encodeURIComponent(errorMessage(e))));
  }
  invalidate("ow:");
  redirect(done(userPage(target, "linked=1")));
}

/** Admin: detach the device-data account (nothing is deleted in the backend). */
export async function unlinkOwUser(fd: FormData) {
  const target = await targetUser(fd);
  await W.linkOwUser(target.athlete_id, null);
  invalidate("ow:");
  redirect(done(userPage(target, "unlinked=1")));
}

export async function createAndLinkOwUser(fd: FormData) {
  const target = await targetUser(fd);
  let id: string;
  try {
    const u = await createUser(str(fd, "first_name") ?? target.name, str(fd, "last_name") ?? "");
    id = u.id;
    await W.linkOwUser(target.athlete_id, id);
  } catch (e) {
    redirect(userPage(target, "error=" + encodeURIComponent(errorMessage(e))));
  }
  redirect(done(userPage(target, "linked=1")));
}

export async function renameAthlete(fd: FormData) {
  const { athlete } = await writeCtx();
  const name = str(fd, "name");
  if (name) await W.renameAthlete(athlete.id, name);
  redirect(done("/settings/analysis"));
}

export async function bootstrapOwApplication() {
  await requireAdmin();
  let msg: string;
  try {
    const r = await bootstrapApplication();
    msg = r.created ? "app=created" : "app=exists";
  } catch (e) {
    msg = "error=" + encodeURIComponent(errorMessage(e));
  }
  redirect(done(`/settings/backend?${msg}`));
}

/** Athlete-facing: the backend user is created here on first connect, never asked for. */
export async function connectProvider(fd: FormData) {
  const ctx = await writeCtx();
  const provider = str(fd, "provider");
  const origin = str(fd, "origin");
  // Onboarding sends people back to its connect step; everyone else to Connected accounts.
  const home = str(fd, "return") === "welcome" ? "/welcome?step=connect" : "/settings/accounts";
  if (!provider || !origin) redirect(home);
  let url: string;
  try {
    const userId = await ensureOwUser(ctx.athlete);
    url = await authorizeUrl(provider, userId, `${origin}${withParam(home, "connected", provider)}`);
  } catch (e) {
    redirect(withParam(home, "error", errorMessage(e)));
  }
  redirect(url);
}

/** Finish (or skip) first-run setup and land on Today. */
export async function finishOnboarding() {
  await markOnboarded((await requireUser()).id);
  redirect(done("/"));
}

export async function syncNow(fd: FormData) {
  const ctx = await writeCtx();
  const provider = str(fd, "provider");
  if (!ctx.ow || !provider) redirect("/settings/accounts");
  let msg = `synced=${encodeURIComponent(provider)}`;
  try {
    await syncProvider(ctx.ow, provider);
  } catch (e) {
    msg = "error=" + encodeURIComponent(errorMessage(e));
  }
  invalidate(`ow:${ctx.ow.userId}`);
  redirect(done(`/settings/accounts?${msg}`));
}

/** Admin: the phone app pairing code issued by the backend for this user's device-data account. */
export async function savePhoneCode(fd: FormData) {
  const target = await targetUser(fd);
  if (fd.get("clear")) {
    await setPhoneCode(target.athlete_id, null);
    redirect(done(userPage(target, "code=cleared")));
  }
  const code = str(fd, "phone_code");
  if (!code || !PHONE_CODE_RE.test(code)) redirect(userPage(target, "error=" + encodeURIComponent("Paste the pairing code as issued: 4 to 128 characters, no spaces.")));
  await setPhoneCode(target.athlete_id, code);
  redirect(done(userPage(target, "code=saved")));
}

/** Admin: the phone sync app every athlete is pointed to (install-wide). */
export async function savePhoneApp(fd: FormData) {
  await requireAdmin();
  try {
    await setPhoneApp({ name: str(fd, "name") ?? "", installUrl: str(fd, "installUrl") ?? "" });
  } catch (e) {
    if (e instanceof z.ZodError) redirect(withParam("/settings/backend", "error", "The install link must be an https:// address."));
    throw e;
  }
  redirect(done("/settings/backend?saved=1"));
}

export async function refreshDeviceData() {
  const ctx = await getCtx();
  invalidate(ctx.ow ? `ow:${ctx.ow.userId}` : "ow:");
  redirect(done("/"));
}

// ---------- API tokens ----------

export interface TokenState {
  token: string | null;
  error: string | null;
}

/** The plaintext token goes back to the page once; only its hash is stored. */
export async function createApiToken(_prev: TokenState, fd: FormData): Promise<TokenState> {
  const { athlete } = await writeCtx();
  const name = str(fd, "name");
  if (!name) return { token: null, error: "Name the token after the device or script that will use it." };
  const { token } = await issueToken(athlete.id, name);
  revalidatePath("/settings/api");
  return { token, error: null };
}

export async function revokeApiToken(fd: FormData) {
  const { athlete } = await writeCtx();
  await revokeToken(athlete.id, num(fd, "id") ?? 0);
  redirect(done("/settings/api?revoked=1"));
}

// ---------- zones ----------

/** Zone settings: thresholds (pace as m:ss), model per metric, custom boundary lists. */
export async function updateZones(fd: FormData) {
  const { athlete } = await writeCtx();
  const numOrNull = (k: string) => { const v = str(fd, k); return v == null ? null : Number(v); };
  const list = (k: string, pace = false): number[] | string => {
    const v = str(fd, k);
    if (!v) return [];
    const parts = v.split(",").map((x) => x.trim()).filter(Boolean);
    const out = parts.map((x) => (pace ? parsePace(x) : Number(x)));
    return out.every((x) => x != null && Number.isFinite(x)) ? (out as number[]) : `${k}: use ${pace ? "m:ss paces" : "numbers"} separated by commas`;
  };
  const tp = str(fd, "pace.threshold");
  const thresholdPace = tp ? parsePace(tp) : null;
  const lists = { hr: list("hr.custom"), pace: list("pace.custom", true), runpower: list("runpower.custom"), bikepower: list("bikepower.custom") };
  const bad = Object.values(lists).find((x) => typeof x === "string") as string | undefined;
  if (bad) redirect(withParam("/settings/zones", "error", bad));
  if (tp && thresholdPace == null) redirect(withParam("/settings/zones", "error", "Threshold pace must look like 4:05 (min:sec per km)"));
  try {
    await patchSettings(athlete.id, {
      zones: {
        hr: { model: str(fd, "hr.model"), lthr: numOrNull("hr.lthr"), custom: lists.hr },
        pace: { model: str(fd, "pace.model"), thresholdPaceSecPerKm: thresholdPace, custom: lists.pace },
        runpower: { model: str(fd, "runpower.model"), criticalPowerW: numOrNull("runpower.cp"), custom: lists.runpower },
        bikepower: { model: str(fd, "bikepower.model"), ftpW: numOrNull("bikepower.ftp"), custom: lists.bikepower },
      },
      ...(fd.has("load.hrMax") ? { load: { hrMax: num(fd, "load.hrMax") } } : {}),
    });
  } catch (e) {
    if (e instanceof z.ZodError) redirect(withParam("/settings/zones", "error", e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")));
    throw e;
  }
  redirect(done("/settings/zones?saved=1"));
}

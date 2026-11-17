import "server-only";
import { cached } from "../cache";
import { addDays, addMonths, endOfMonth, startOfMonth } from "../dates";
import { q1, q } from "../db";
import { stored, writeCredentials } from "../credentials";
import { owJson, owPaginate, owRaw, PAGE_LIMIT, OwError, type Query } from "./client";
import type {
  OwApplication, OwConnection, OwDevice, OwDeviceHistoryEntry, OwProvider, OwRecoverySummary,
  OwSleepSession, OwSleepSummary, OwTimeSeriesSample, OwUser, OwWorkout,
} from "./types";

/** Per-request context: which OW user, relay policy, and cache TTL. */
export interface OwCtx {
  userId: string;
  includeRedundantRelays: boolean;
  ttl: number;
  historicalTtl: number;
}

/**
 * Day-indexed reads are fetched in whole calendar months, in parallel, and
 * cached per month. Different windows (dashboard, readiness, trends) then share
 * cached months instead of refetching overlapping ranges, and settled months
 * get the longer historical TTL.
 */
async function byMonth<T>(
  ctx: OwCtx,
  name: string,
  start: string,
  end: string,
  fetchMonth: (from: string, to: string) => Promise<T[]>,
  dayOf: (row: T) => string,
): Promise<T[]> {
  const months: [string, string][] = [];
  for (let m = startOfMonth(start); m <= end; m = addMonths(m, 1)) months.push([m, endOfMonth(m)]);
  const settledBefore = addDays(new Date().toISOString().slice(0, 10), -7);
  const results: T[][] = new Array(months.length);
  let next = 0;
  const worker = async () => {
    while (next < months.length) {
      const i = next++;
      const [from, to] = months[i];
      const ttl = to < settledBefore ? Math.max(ctx.ttl, ctx.historicalTtl) : ctx.ttl;
      results[i] = await cached(key(ctx, name, [from, to]), ttl, () => fetchMonth(from, to));
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, months.length) }, worker));
  return results.flat().filter((r) => {
    const d = dayOf(r);
    return d >= start && d <= end;
  });
}

const enc = encodeURIComponent;
const userPath = (ctx: OwCtx, rest: string) => `/users/${enc(ctx.userId)}${rest}`;

function relay(ctx: OwCtx, force?: boolean): Query {
  // Only send the flag when on; leaving it absent keeps OW's default dedup.
  return force ?? ctx.includeRedundantRelays ? { include_redundant_relays: true } : {};
}

function key(ctx: OwCtx, name: string, parts: unknown): string {
  return `ow:${ctx.userId}:${name}:${ctx.includeRedundantRelays ? 1 : 0}:${JSON.stringify(parts)}`;
}

// ---------- directory / setup ----------

export async function listProviders(): Promise<OwProvider[]> {
  return cached("ow:providers", 600, () => owJson<OwProvider[]>("/oauth/providers"));
}

export async function searchUsers(search: string): Promise<OwUser[]> {
  // /users is page-numbered (not cursor) and capped at 100 per page.
  const out: OwUser[] = [];
  for (let page = 1; page <= 50; page++) {
    const body = await owJson<{ items: OwUser[]; has_next: boolean }>("/users", {
      query: { page, limit: PAGE_LIMIT.users, search: search || undefined },
    });
    out.push(...body.items);
    if (!body.has_next) return out;
  }
  throw new OwError("User listing exceeded 50 pages; refine the search", 502, "TOO_MANY_PAGES", "/users");
}

export async function getUser(userId: string): Promise<OwUser> {
  return owJson<OwUser>(`/users/${enc(userId)}`);
}

export async function createUser(firstName: string, lastName: string): Promise<OwUser> {
  return owJson<OwUser>("/users", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ first_name: firstName || null, last_name: lastName || null }),
  });
}

// The application (including its one-time secret) is kept sealed in the
// credential store. Installs from before the store kept it in system_kv in
// plain text; the first read moves it across and deletes the old row.
async function readApplication(): Promise<OwApplication | null> {
  const sealed = await stored("OW_APPLICATION");
  if (sealed) return JSON.parse(sealed) as OwApplication;
  const legacy = await q1<{ value: OwApplication }>("SELECT value FROM system_kv WHERE key = 'ow_application'");
  if (!legacy) return null;
  await writeCredentials({ OW_APPLICATION: JSON.stringify(legacy.value) });
  await q("DELETE FROM system_kv WHERE key = 'ow_application'");
  return legacy.value;
}

/**
 * Ensure an OW application named "AthleteOS" exists and its credentials are
 * stored. OW reveals app_secret only at creation, so it is persisted then; if
 * the stored app was deleted in OW, a new one is created.
 */
export async function bootstrapApplication(): Promise<{ app_id: string; created: boolean }> {
  const current = await readApplication();
  const apps = await owJson<OwApplication[]>("/applications");
  if (current && apps.some((a) => a.id === current.id)) return { app_id: current.app_id, created: false };
  const app = await owJson<OwApplication>("/applications", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "AthleteOS" }),
  });
  await writeCredentials({ OW_APPLICATION: JSON.stringify(app) });
  return { app_id: app.app_id, created: true };
}

export async function storedApplication(): Promise<Pick<OwApplication, "id" | "app_id" | "name" | "created_at"> | null> {
  const app = await readApplication();
  if (!app) return null;
  const { id, app_id, name, created_at } = app;
  return { id, app_id, name, created_at };
}

export interface OwSdkTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds, as OW reported it; null when OW did not say. */
  expiresIn: number | null;
}

/**
 * A token pair for OW's mobile SDK, for one OW user. The access token writes
 * only to that user's `/sdk/*`; the SDK refreshes it itself. The application
 * credentials that mint it can mint for ANY user, so they never leave the
 * server: the phone gets the pair. A pair missing either token would sign the
 * SDK in to nothing and look like a phone that never synced, so it is refused.
 */
export async function mintSdkToken(userId: string): Promise<OwSdkTokens> {
  let app = await readApplication();
  if (!app?.app_secret) {
    await bootstrapApplication();
    app = await readApplication();
  }
  if (!app?.app_secret) throw new OwError("The OW application has no stored secret; recreate it under Data backend", 503, "NO_APP_SECRET", "/users/{id}/token");
  let body: { access_token?: unknown; refresh_token?: unknown; expires_in?: unknown };
  try {
    body = await owJson(`/users/${enc(userId)}/token`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ app_id: app.app_id, app_secret: app.app_secret }),
    });
  } catch (e) {
    // A validation error echoes the request body, secret included: keep the status, drop OW's words.
    if (e instanceof OwError) throw new OwError(`token: HTTP ${e.status}`, e.status, e.code, "/users/{id}/token");
    throw e;
  }
  const access = body?.access_token, refresh = body?.refresh_token, expires = body?.expires_in;
  if (typeof access !== "string" || !access || typeof refresh !== "string" || !refresh) {
    throw new OwError("token: the answer has no access_token or no refresh_token", 502, "BAD_TOKEN_ANSWER", "/users/{id}/token");
  }
  return { accessToken: access, refreshToken: refresh, expiresIn: typeof expires === "number" && Number.isFinite(expires) ? expires : null };
}

export async function authorizeUrl(provider: string, userId: string, redirectUri: string): Promise<string> {
  const body = await owJson<{ authorization_url: string }>(`/oauth/${enc(provider)}/authorize`, {
    query: { user_id: userId, redirect_uri: redirectUri, account_type: "personal" },
  });
  return body.authorization_url;
}

export async function getConnections(ctx: OwCtx): Promise<OwConnection[]> {
  return cached(key(ctx, "connections", 0), Math.min(ctx.ttl, 60), () =>
    owJson<OwConnection[]>(userPath(ctx, "/connections")),
  );
}

export async function syncProvider(ctx: OwCtx, provider: string): Promise<unknown> {
  return owJson(`/providers/${enc(provider)}/users/${enc(ctx.userId)}/sync`, {
    method: "POST",
    query: { data_type: "all", async: true },
  });
}

// ---------- device data ----------

export interface TimeseriesOpts {
  start: string;
  end: string;
  types: string[];
  resolution?: "raw" | "1min" | "5min" | "15min" | "1hour" | "1day" | "1week" | "1month";
  dataSourceId?: string;
  /** `all` keeps every source so AthleteOS can choose and label explicitly. */
  sourceSelection?: "all" | "per_range" | "per_period" | "reconcile";
  includeRedundantRelays?: boolean;
  /** Cache lifetime override, e.g. the historical TTL for windows that can no longer change. */
  ttl?: number;
}

export async function getTimeseries(ctx: OwCtx, o: TimeseriesOpts): Promise<OwTimeSeriesSample[]> {
  const query: Query = {
    start_time: o.start,
    end_time: o.end,
    types: o.types,
    resolution: o.resolution ?? "raw",
    data_source_id: o.dataSourceId,
    source_selection: o.sourceSelection ?? "all",
    ...relay(ctx, o.includeRedundantRelays),
  };
  return cached(key(ctx, "ts", query), o.ttl ?? ctx.ttl, () =>
    owPaginate<OwTimeSeriesSample>(userPath(ctx, "/timeseries"), query, PAGE_LIMIT.timeseries),
  );
}

export async function getSleepSummaries(ctx: OwCtx, start: string, end: string): Promise<OwSleepSummary[]> {
  // filter_by_priority=false: every source per night, so device choice is ours and visible.
  return byMonth(ctx, "sleepsum", start, end, (from, to) =>
    owPaginate<OwSleepSummary>(userPath(ctx, "/summaries/sleep"),
      { start_date: from, end_date: to, filter_by_priority: false, ...relay(ctx) }, PAGE_LIMIT.sleepSummaries),
    (r) => r.date);
}

export async function getRecoverySummaries(ctx: OwCtx, start: string, end: string): Promise<OwRecoverySummary[]> {
  return byMonth(ctx, "recovery", start, end, (from, to) =>
    owPaginate<OwRecoverySummary>(userPath(ctx, "/summaries/recovery"),
      { start_date: from, end_date: to, filter_by_priority: false, ...relay(ctx) }, PAGE_LIMIT.recovery),
    (r) => r.date);
}

export async function getSleepEvents(
  ctx: OwCtx,
  start: string,
  end: string,
  opts: { stages?: boolean; dataSourceId?: string } = {},
): Promise<OwSleepSession[]> {
  const query: Query = {
    start_date: start,
    end_date: end,
    include: opts.stages ? ["stages"] : undefined,
    source_selection: "all",
    data_source_id: opts.dataSourceId,
    ...relay(ctx),
  };
  return cached(key(ctx, "sleepev", query), ctx.ttl, () =>
    owPaginate<OwSleepSession>(userPath(ctx, "/events/sleep"), query, PAGE_LIMIT.sleepEvents),
  );
}

export async function getWorkouts(ctx: OwCtx, start: string, end: string): Promise<OwWorkout[]> {
  // Bounds are UTC days; callers pad and then filter by the athlete's local date.
  return byMonth(ctx, "workouts", start, end, (from, to) =>
    owPaginate<OwWorkout>(userPath(ctx, "/events/workouts"),
      { start_date: from, end_date: to, source_selection: "all", ...relay(ctx) }, PAGE_LIMIT.workouts),
    (w) => w.start_time.slice(0, 10));
}

export async function getDevices(ctx: OwCtx): Promise<OwDevice[]> {
  return cached(key(ctx, "devices", 0), ctx.ttl, async () => {
    const body = await owJson<{ items: OwDevice[] }>(userPath(ctx, "/devices"), { query: { include_retired: true } });
    return body.items;
  });
}

export async function getDevicesHistory(ctx: OwCtx): Promise<{ items: OwDeviceHistoryEntry[]; total: number }> {
  // Not cursor-paged: newest-first with a cap. `total` tells the UI when the cap truncated.
  return cached(key(ctx, "devhist", 0), ctx.ttl, () =>
    owJson<{ items: OwDeviceHistoryEntry[]; total: number }>(userPath(ctx, "/devices-history"), {
      query: { limit: PAGE_LIMIT.devicesHistory },
    }),
  );
}

/** Bulk raw export (NDJSON/CSV), end_time exclusive. Streamed, never cached. */
export async function exportSeries(
  ctx: OwCtx,
  o: { start: string; end: string; types: string[]; format: "ndjson" | "csv" },
): Promise<Response> {
  const res = await owRaw(userPath(ctx, "/export/series"), {
    query: { start_time: o.start, end_time: o.end, types: o.types.length ? o.types : undefined, format: o.format },
    // Exports can be large; allow far longer than an ordinary read.
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!res.ok) throw new OwError(`Open Wearables ${res.status} on export`, res.status, undefined, "/export/series");
  return res;
}

export interface OwDataSource {
  id: string;
  provider: string;
  device_model: string | null;
  source: string | null;
  device_type: string | null;
  original_source_name: string | null;
  display_name: string;
  device_id: string | null;
  account_type: string | null;
  account_label: string | null;
  ingestion_route: string | null;
  redundant_relay: boolean;
}

export async function getDataSources(ctx: OwCtx): Promise<OwDataSource[]> {
  return cached(key(ctx, "datasources", 0), ctx.ttl, async () => {
    const body = await owJson<{ items: OwDataSource[] }>(userPath(ctx, "/data-sources"));
    return body.items;
  });
}

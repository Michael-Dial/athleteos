import "server-only";

// Thin, strict HTTP client for the Open Wearables API. AthleteOS never talks to
// vendor APIs; everything device-related goes through here.

export class OwError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly path?: string,
  ) {
    super(message);
    this.name = "OwError";
  }
}

export class OwNotConfiguredError extends Error {
  constructor(message = "Open Wearables is not configured: set OW_API_BASE and OW_API_KEY or OW_EMAIL/OW_PASSWORD.") {
    super(message);
    this.name = "OwNotConfiguredError";
  }
}

// Verified page caps for this fork. /users is page-numbered with a lower cap.
export const PAGE_LIMIT = {
  timeseries: 1000,
  sleepSummaries: 1000,
  sleepEvents: 1000,
  workouts: 1000,
  recovery: 1000,
  devicesHistory: 1000,
  users: 100,
} as const;

// Hard stop so a server that keeps returning cursors can't spin forever.
const MAX_PAGES = 500;
const TIMEOUT_MS = 60_000;
// Idempotent GETs are retried on transport failures (resets, truncated bodies)
// but never on HTTP errors, which are real answers.
const GET_RETRIES = 2;

type Scalar = string | number | boolean | null | undefined;
export type Query = Record<string, Scalar | Scalar[]>;

export function owBase(): string {
  const base = process.env.OW_API_BASE;
  if (!base) throw new OwNotConfiguredError();
  return base.replace(/\/+$/, "");
}

export function owConfigured(): boolean {
  return Boolean(process.env.OW_API_BASE && (process.env.OW_API_KEY || (process.env.OW_EMAIL && process.env.OW_PASSWORD)));
}

export function buildQuery(params: Query = {}): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    // Arrays repeat the key (types=a&types=b), which is what FastAPI expects.
    const vals = Array.isArray(v) ? v : [v];
    for (const one of vals) {
      if (one === undefined || one === null || one === "") continue;
      sp.append(k, String(one));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

const g = globalThis as unknown as { __owToken?: { token: string; exp: number } };

async function login(force = false): Promise<string> {
  const now = Date.now();
  if (!force && g.__owToken && g.__owToken.exp > now) return g.__owToken.token;
  const email = process.env.OW_EMAIL;
  const password = process.env.OW_PASSWORD;
  if (!email || !password) throw new OwNotConfiguredError();
  const res = await fetch(`${owBase()}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: email, password }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res, "/auth/login");
  const body = (await res.json()) as { access_token: string; expires_in?: number | null };
  // Refresh a minute early so a token never expires mid-pagination.
  const ttl = Math.max(60, (body.expires_in ?? 1800) - 60) * 1000;
  g.__owToken = { token: body.access_token, exp: now + ttl };
  return body.access_token;
}

async function authHeaders(force = false): Promise<Record<string, string>> {
  // An API key is preferred for server-to-server calls: no expiry, no login
  // round-trip. Developer login is the fallback the brief specifies.
  if (process.env.OW_API_KEY) return { "X-Open-Wearables-API-Key": process.env.OW_API_KEY };
  return { authorization: `Bearer ${await login(force)}` };
}

async function toError(res: Response, path: string): Promise<OwError> {
  let detail = res.statusText;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { detail?: unknown; code?: string };
    if (typeof body.detail === "string") detail = body.detail;
    else if (body.detail) detail = JSON.stringify(body.detail);
    code = body.code;
  } catch {
    // Non-JSON error body; keep the status text.
  }
  return new OwError(`Open Wearables ${res.status} on ${path}: ${detail}`, res.status, code, path);
}

export async function owRaw(path: string, init: RequestInit & { query?: Query } = {}): Promise<Response> {
  const url = `${owBase()}${path}${buildQuery(init.query)}`;
  const doFetch = async (force: boolean) =>
    fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}), ...(await authHeaders(force)) },
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  let res = await doFetch(false);
  // A bearer token can be revoked server-side before its expiry; retry once.
  if (res.status === 401 && !process.env.OW_API_KEY) res = await doFetch(true);
  return res;
}

function transient(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /terminated|ECONNRESET|socket|EPIPE|UND_ERR/i.test(`${e.message} ${String((e as { cause?: unknown }).cause ?? "")}`));
}

export async function owJson<T>(path: string, init: RequestInit & { query?: Query } = {}): Promise<T> {
  const isGet = !init.method || init.method === "GET";
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await owRaw(path, init);
      if (!res.ok) throw await toError(res, path);
      if (res.status === 204) return undefined as T;
      return (await res.json()) as T;
    } catch (e) {
      if (!isGet || attempt >= GET_RETRIES || !transient(e)) throw e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
}

interface CursorPage<T> {
  data: T[];
  pagination: { next_cursor: string | null; has_more: boolean };
}

/**
 * Follow `pagination.next_cursor` until `has_more` is false. Throws when the
 * server says there is more but gives no cursor (or repeats one), because
 * stopping silently there would under-count a window without anyone noticing.
 */
export async function owPaginate<T>(path: string, query: Query, limit: number): Promise<T[]> {
  const out: T[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const body: CursorPage<T> = await owJson<CursorPage<T>>(path, { query: { ...query, limit, cursor } });
    if (!body || !Array.isArray(body.data) || !body.pagination) {
      throw new OwError(`Open Wearables returned an unexpected page shape on ${path}`, 502, "BAD_PAGE", path);
    }
    out.push(...body.data);
    const { has_more, next_cursor } = body.pagination;
    if (!has_more) return out;
    if (!next_cursor) {
      throw new OwError(`Open Wearables reported has_more with no next_cursor on ${path}`, 502, "MISSING_CURSOR", path);
    }
    if (seen.has(next_cursor)) {
      throw new OwError(`Open Wearables repeated cursor on ${path}`, 502, "REPEATED_CURSOR", path);
    }
    seen.add(next_cursor);
    cursor = next_cursor;
  }
  throw new OwError(`Pagination exceeded ${MAX_PAGES} pages on ${path}; narrow the window`, 502, "TOO_MANY_PAGES", path);
}

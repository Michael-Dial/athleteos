import "server-only";
import { createHash } from "node:crypto";
import { cred } from "../credentials";

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
  constructor(message = "Open Wearables is not configured: add its URL and an API key or developer login in Settings → Credentials.") {
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

export interface OwConfig {
  base: string;
  apiKey?: string;
  email?: string;
  password?: string;
}

/** Credentials as entered in Settings, falling back to the environment. */
export async function owConfig(): Promise<OwConfig | null> {
  const [base, apiKey, email, password] = await Promise.all([cred("OW_API_BASE"), cred("OW_API_KEY"), cred("OW_EMAIL"), cred("OW_PASSWORD")]);
  if (!base || !(apiKey || (email && password))) return null;
  return { base: base.replace(/\/+$/, ""), apiKey, email, password };
}

async function requireConfig(): Promise<OwConfig> {
  const c = await owConfig();
  if (!c) throw new OwNotConfiguredError();
  return c;
}

export async function owConfigured(): Promise<boolean> {
  return (await owConfig()) !== null;
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

const g = globalThis as unknown as { __owToken?: { key: string; token: string; exp: number } };

// The cached token is keyed to the credentials it came from, so saving new
// ones in Settings takes effect on the next request.
function tokenKey(c: OwConfig): string {
  return createHash("sha256").update(`${c.base}\n${c.email}\n${c.password}`).digest("base64url");
}

async function login(c: OwConfig, force = false): Promise<string> {
  const now = Date.now();
  const key = tokenKey(c);
  if (!force && g.__owToken && g.__owToken.key === key && g.__owToken.exp > now) return g.__owToken.token;
  if (!c.email || !c.password) throw new OwNotConfiguredError();
  const res = await fetch(`${c.base}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: c.email, password: c.password }).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw await toError(res, "/auth/login");
  const body = (await res.json()) as { access_token: string; expires_in?: number | null };
  // Refresh a minute early so a token never expires mid-pagination.
  const ttl = Math.max(60, (body.expires_in ?? 1800) - 60) * 1000;
  g.__owToken = { key, token: body.access_token, exp: now + ttl };
  return body.access_token;
}

async function authHeaders(c: OwConfig, force = false): Promise<Record<string, string>> {
  // An API key is preferred for server-to-server calls: no expiry, no login
  // round-trip. Developer login is the fallback the brief specifies.
  if (c.apiKey) return { "X-Open-Wearables-API-Key": c.apiKey };
  return { authorization: `Bearer ${await login(c, force)}` };
}

/**
 * Try a configuration before it is saved: one authenticated request, nothing
 * kept. Returns null when it works, otherwise what went wrong.
 */
export async function probeOw(c: OwConfig): Promise<string | null> {
  try {
    if (c.apiKey) {
      // Any authenticated read proves the key; the row itself is discarded.
      const res = await fetch(`${c.base}/users${buildQuery({ limit: 1 })}`, {
        headers: { accept: "application/json", "X-Open-Wearables-API-Key": c.apiKey },
        signal: AbortSignal.timeout(20_000), cache: "no-store",
      });
      if (!res.ok) return (await toError(res, "/users")).message;
    }
    if (c.email && c.password) {
      const token = await login(c, true);
      const res = await fetch(`${c.base}/auth/me`, {
        headers: { accept: "application/json", authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(20_000), cache: "no-store",
      });
      if (!res.ok) return (await toError(res, "/auth/me")).message;
    }
    return null;
  } catch (e) {
    const cause = (e as { cause?: { code?: string; message?: string } }).cause;
    return `Couldn't reach ${c.base}: ${cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : String(e))}`;
  }
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
  const c = await requireConfig();
  const url = `${c.base}${path}${buildQuery(init.query)}`;
  const doFetch = async (force: boolean) =>
    fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}), ...(await authHeaders(c, force)) },
      signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  let res = await doFetch(false);
  // A bearer token can be revoked server-side before its expiry; retry once.
  if (res.status === 401 && !c.apiKey) res = await doFetch(true);
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

import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE, authDisabled } from "../auth";
import { q1 } from "../db";
import { sessionUserId } from "../user-session";
import { userByAthlete, userById, type User } from "../users";
import { addDays, diffDays, todayIn } from "../dates";
import { loadCtx, type AppCtx } from "../domain/context";
import { NotFoundError } from "../domain/writes";
import { OwError, OwNotConfiguredError } from "../ow/client";
import { errorMessage } from "../domain/errors";
import { resolveToken } from "./tokens";

// Every /api/v1 handler is wrapped by apiRoute(): it authenticates (bearer
// token or web session), loads the athlete's context, and maps every failure
// onto one error shape: { error: { code, message, details? } }.

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string, readonly details?: unknown) {
    super(message);
  }
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export function json(data: unknown, status = 200): NextResponse {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

function errorResponse(e: ApiError): NextResponse {
  return json({ error: { code: e.code, message: e.message, ...(e.details !== undefined ? { details: e.details } : {}) } }, e.status);
}

export interface ApiCall<P> {
  req: NextRequest;
  ctx: AppCtx;
  params: P;
  auth: "token" | "session";
  user: User;
}

// Every call acts as one user on their own athlete. A token belongs to the
// user owning its athlete and stops working when that user is disabled.
async function authenticate(req: NextRequest): Promise<{ user: User; auth: "token" | "session" }> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const t = await resolveToken(header.slice(7).trim());
    const user = t ? await userByAthlete(t.athleteId) : null;
    if (!user || user.disabled) throw new ApiError(401, "unauthorized", "Token is invalid or revoked");
    return { user, auth: "token" };
  }
  if (authDisabled()) {
    const a = await q1<{ id: number }>("SELECT id FROM app_user WHERE role = 'admin' AND disabled_at IS NULL ORDER BY id LIMIT 1");
    const user = a ? await userById(a.id) : null;
    if (!user) throw new ApiError(401, "unauthorized", "Open the web app once to create the owner account");
    return { user, auth: "session" };
  }
  const id = await sessionUserId(req.cookies.get(SESSION_COOKIE)?.value);
  const user = id === null ? null : await userById(id);
  if (user) return { user, auth: "session" };
  throw new ApiError(401, "unauthorized", "Send Authorization: Bearer <token> or sign in");
}

export function apiRoute<P = Record<string, never>>(
  handler: (call: ApiCall<P>) => Promise<NextResponse | unknown>,
) {
  return async (req: NextRequest, route: { params: Promise<P> }): Promise<NextResponse> => {
    try {
      const { user, auth } = await authenticate(req);
      const ctx = await loadCtx(user.athlete_id);
      const params = (await route?.params) ?? ({} as P);
      const out = await handler({ req, ctx, params, auth, user });
      return out instanceof NextResponse ? out : json(out);
    } catch (e) {
      return toErrorResponse(e);
    }
  };
}

export function toErrorResponse(e: unknown): NextResponse {
  if (e instanceof ApiError) return errorResponse(e);
  if (e instanceof z.ZodError) {
    return errorResponse(new ApiError(422, "validation_failed", "Request did not validate",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message }))));
  }
  if (e instanceof NotFoundError) return errorResponse(new ApiError(404, "not_found", e.message));
  if (e instanceof OwNotConfiguredError) return errorResponse(new ApiError(409, "ow_not_configured", errorMessage(e)));
  if (e instanceof OwError) return errorResponse(new ApiError(502, "ow_unavailable", errorMessage(e)));
  console.error("api error", e);
  return errorResponse(new ApiError(500, "internal", "Unexpected server error"));
}

export async function body<T>(req: NextRequest, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "bad_json", "Body must be valid JSON");
  }
  return schema.parse(raw);
}

export function query<T>(req: NextRequest, schema: z.ZodType<T>): T {
  return schema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
}

export { DateParam } from "./params";
export { WindowQuery } from "./schemas";

/** Resolve ?start&end into a bounded window (inclusive), defaulting to the last `defaultDays`. */
export function window(ctx: AppCtx, w: { start?: string; end?: string }, defaultDays: number, maxDays: number): { start: string; end: string } {
  const end = w.end ?? todayIn(ctx.settings.timezone);
  const start = w.start ?? addDays(end, -(defaultDays - 1));
  if (start > end) throw new ApiError(400, "bad_window", "start must be on or before end");
  if (diffDays(end, start) + 1 > maxDays) throw new ApiError(400, "window_too_large", `window is limited to ${maxDays} days`);
  return { start, end };
}

export function intParam(v: string | undefined, name: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new ApiError(400, "bad_param", `${name} must be a positive integer`);
  return n;
}

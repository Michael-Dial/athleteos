import type { NextRequest } from "next/server";
import { checkPassword } from "@/lib/auth";
import { issueToken } from "@/lib/api/tokens";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { q1 } from "@/lib/db";
import { TokenRequest } from "@/lib/api/schemas";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

// Sign-in for native apps: trade the AthleteOS password for a bearer token.
// Shares the web login's per-IP throttle.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, TokenRequest);
    if (!(await checkPassword(b.password))) {
      recordFailure(ip);
      throw new ApiError(401, "bad_credentials", "Password did not match");
    }
    clearFailures(ip);
    const athlete = await q1<{ id: number }>("SELECT id FROM athlete ORDER BY id LIMIT 1");
    if (!athlete) throw new ApiError(500, "no_athlete", "No athlete exists yet");
    const { token, row } = await issueToken(athlete.id, b.name);
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString() }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

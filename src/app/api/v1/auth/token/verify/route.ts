import type { NextRequest } from "next/server";
import { issueToken } from "@/lib/api/tokens";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { q1 } from "@/lib/db";
import { TokenVerifyRequest } from "@/lib/api/schemas";
import { verifyChallenge } from "@/lib/login-challenge";

const REASON: Record<string, [number, string, string]> = {
  invalid: [401, "bad_code", "That code isn't right"],
  expired: [410, "code_expired", "The code expired; sign in again"],
  locked: [429, "code_locked", "Too many wrong codes; sign in again"],
  unknown: [404, "unknown_challenge", "No pending sign-in for that id; sign in again"],
};

// Second step of native-app sign-in: exchange the emailed code for a token.
export async function POST(req: NextRequest) {
  try {
    const b = await body(req, TokenVerifyRequest);
    const r = await verifyChallenge(b.challengeId, b.code, "token");
    if (!r.ok) { const [s, c, m] = REASON[r.reason]; throw new ApiError(s, c, m); }
    const athlete = await q1<{ id: number }>("SELECT id FROM athlete ORDER BY id LIMIT 1");
    if (!athlete) throw new ApiError(500, "no_athlete", "No athlete exists yet");
    const { token, row } = await issueToken(athlete.id, r.challenge.meta.name ?? "App");
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString() }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

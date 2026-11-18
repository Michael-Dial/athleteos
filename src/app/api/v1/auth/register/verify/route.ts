import type { NextRequest } from "next/server";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { asApiError } from "@/lib/api/registration-errors";
import { TokenVerifyRequest } from "@/lib/api/schemas";
import { issueToken } from "@/lib/api/tokens";
import { finishRegistration } from "@/lib/registration";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

// Sign-up step two: the emailed code creates the member account and returns a
// token for this phone. Wrong codes count against the per-IP limit too.
export async function POST(req: NextRequest) {
  const ip = clientIp(req.headers);
  try {
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, TokenVerifyRequest);
    const { user, device } = await finishRegistration(b.challengeId, b.code);
    clearFailures(ip);
    const { token, row } = await issueToken(user.athlete_id, device);
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString(), athlete: { id: user.athlete_id, name: user.name } }, 201);
  } catch (e) {
    const err = asApiError(e);
    if (err instanceof ApiError && err.code === "bad_code") recordFailure(ip);
    return toErrorResponse(err);
  }
}

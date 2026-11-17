import type { NextRequest } from "next/server";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { InviteRedeem } from "@/lib/api/schemas";
import { redeemInvite } from "@/lib/invites";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

// Native app sign-in for an invited athlete: the admin's one-time code in, an
// API token for that athlete out. Shares the password sign-in's per-IP
// throttle, so codes can't be guessed faster than passwords.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, InviteRedeem);
    const r = await redeemInvite(b.code, b.name);
    if (!r.ok) {
      recordFailure(ip);
      throw r.reason === "malformed"
        ? new ApiError(422, "bad_code_format", "An invite code is 10 letters and digits, like 7KQ2M-X9D4R")
        : new ApiError(401, "bad_invite", "That invite code isn't valid. It may have been used or expired; ask for a new one.");
    }
    clearFailures(ip);
    return json({ token: r.token, id: r.tokenId, name: r.tokenName, createdAt: r.createdAt, athlete: r.athlete }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

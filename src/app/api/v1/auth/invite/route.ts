import type { NextRequest } from "next/server";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { InviteRedeem } from "@/lib/api/schemas";
import { issueToken } from "@/lib/api/tokens";
import { MIN_PASSWORD_LENGTH } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { consumeLink, normalizeCode, touchLogin } from "@/lib/users";

// The web invite page (/invite) for the iPhone app: the admin's invite (or
// reset) code and a new password in, the password set and a token for this
// phone out. The same code the web accepts, single use, and wrong codes count
// against the same per-IP limit as wrong passwords.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, InviteRedeem);
    if (!normalizeCode(b.code)) throw new ApiError(422, "bad_code_format", "An invite code has 12 letters and digits, like K7QM-2XRA-9TPD");
    if (b.password.length < MIN_PASSWORD_LENGTH) throw new ApiError(422, "short_password", `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters`);
    const user = await consumeLink(b.code, b.password);
    if (!user) {
      recordFailure(ip);
      throw new ApiError(401, "bad_invite", "That code isn't valid. It may have been used or expired; ask your admin for a new one.");
    }
    clearFailures(ip);
    await touchLogin(user.id);
    const { token, row } = await issueToken(user.athlete_id, b.name);
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString(), athlete: { id: user.athlete_id, name: user.name } }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

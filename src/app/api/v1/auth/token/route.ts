import type { NextRequest } from "next/server";
import { checkPassword, loginCodeRequired, maskEmail } from "@/lib/auth";
import { issueToken } from "@/lib/api/tokens";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { q1 } from "@/lib/db";
import { TokenRequest } from "@/lib/api/schemas";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { createChallenge } from "@/lib/login-challenge";
import { loginEmail, mailConfigured, sendLoginCode } from "@/lib/mail";

// Sign-in for native apps: password, then (when LOGIN_2FA=email) the emailed
// code via /auth/token/verify. Shares the web login's per-IP throttle.
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
    if (loginCodeRequired()) {
      if (!mailConfigured()) throw new ApiError(503, "mail_not_configured", "Email codes are on but email isn't set up on the server");
      const { id, code } = await createChallenge("token", ip, { name: b.name });
      try {
        await sendLoginCode(code, { ip, purpose: "token", device: b.name });
      } catch {
        throw new ApiError(502, "mail_failed", "The sign-in code couldn't be emailed");
      }
      return json({ challengeId: id, delivery: "email", destination: maskEmail(loginEmail()!), expiresInSec: 600 }, 202);
    }
    const athlete = await q1<{ id: number }>("SELECT id FROM athlete ORDER BY id LIMIT 1");
    if (!athlete) throw new ApiError(500, "no_athlete", "No athlete exists yet");
    const { token, row } = await issueToken(athlete.id, b.name);
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString() }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

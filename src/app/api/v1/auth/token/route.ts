import type { NextRequest } from "next/server";
import { maskEmail } from "@/lib/auth";
import { loginCodeRequired, signIn } from "@/lib/signin";
import { issueToken } from "@/lib/api/tokens";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { TokenRequest } from "@/lib/api/schemas";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { createChallenge } from "@/lib/login-challenge";
import { mailConfigured, sendLoginCode } from "@/lib/mail";

// Sign-in for native apps: email and password, then (when the user has emailed
// codes on) the code via /auth/token/verify. Shares the web login's per-IP throttle.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, TokenRequest);
    const r = await signIn(b.email, b.password);
    if (!r.ok) {
      recordFailure(ip);
      throw new ApiError(401, "bad_credentials", "Email or password did not match");
    }
    clearFailures(ip);
    const user = r.user;
    if (loginCodeRequired(user)) {
      if (!(await mailConfigured())) throw new ApiError(503, "mail_not_configured", "Email codes are on but email isn't set up on the server");
      const { id, code } = await createChallenge("token", user.id, ip, { name: b.name });
      try {
        await sendLoginCode(code, { ip, purpose: "token", device: b.name, to: user.email });
      } catch {
        throw new ApiError(502, "mail_failed", "The sign-in code couldn't be emailed");
      }
      return json({ challengeId: id, delivery: "email", destination: maskEmail(user.email), expiresInSec: 600 }, 202);
    }
    const { token, row } = await issueToken(user.athlete_id, b.name);
    return json({ token, id: row.id, name: row.name, createdAt: new Date(row.created_at).toISOString() }, 201);
  } catch (e) {
    return toErrorResponse(e);
  }
}

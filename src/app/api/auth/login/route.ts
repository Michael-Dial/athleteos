import type { NextRequest } from "next/server";
import { TRUST_COOKIE, checkPassword, loginCodeRequired, verifyTrustToken } from "@/lib/auth";
import { relRedirect } from "@/lib/http";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { safeNext } from "@/lib/safe-next";
import { createChallenge, trustEpoch } from "@/lib/login-challenge";
import { mailConfigured, sendLoginCode } from "@/lib/mail";
import { setChallenge, setSession } from "@/lib/session-cookies";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const back = (error: string) => relRedirect(`/login?error=${error}&next=${encodeURIComponent(next)}`);
  // Throttled per IP: the login page is exposed through the public tunnel.
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return back("locked");
  if (!(await checkPassword(String(form.get("password") ?? "")))) {
    recordFailure(ip);
    return back("1");
  }
  clearFailures(ip);

  // Second factor: a trusted device skips it; otherwise email a code.
  if (loginCodeRequired() && !(await verifyTrustToken(req.cookies.get(TRUST_COOKIE)?.value, await trustEpoch()))) {
    if (!mailConfigured()) return back("mailconfig");
    const { id, code } = await createChallenge("web", ip, { next });
    try {
      await sendLoginCode(code, { ip, purpose: "web" });
    } catch (e) {
      console.error("sign-in code email failed:", e instanceof Error ? e.message : e);
      return back("mailfail");
    }
    const res = relRedirect(`/login/verify?next=${encodeURIComponent(next)}`);
    setChallenge(res, req, id);
    return res;
  }

  const res = relRedirect(next);
  await setSession(res, req);
  return res;
}

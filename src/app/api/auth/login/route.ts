import type { NextRequest } from "next/server";
import { TRUST_COOKIE, verifyTrustToken } from "@/lib/auth";
import { relRedirect } from "@/lib/http";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { safeNext } from "@/lib/safe-next";
import { createChallenge } from "@/lib/login-challenge";
import { mailConfigured, sendLoginCode } from "@/lib/mail";
import { setChallenge, setSession } from "@/lib/session-cookies";
import { loginCodeRequired, signIn } from "@/lib/signin";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const email = String(form.get("email") ?? "").trim();
  const back = (error: string) => relRedirect(`/login?error=${error}&next=${encodeURIComponent(next)}&email=${encodeURIComponent(email)}`);
  // Throttled per IP: the login page is exposed through the public tunnel.
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return back("locked");
  const r = await signIn(email, String(form.get("password") ?? ""));
  if (!r.ok) {
    recordFailure(ip);
    return back(r.reason === "email_mismatch" ? "firstemail" : "1");
  }
  clearFailures(ip);
  const user = r.user;

  // Second factor: a device this user trusted skips it; otherwise email a code.
  if (loginCodeRequired(user) && !(await verifyTrustToken(req.cookies.get(TRUST_COOKIE)?.value, user.id, user.trust_epoch))) {
    if (!(await mailConfigured())) return back("mailconfig");
    const { id, code } = await createChallenge("web", user.id, ip, { next });
    try {
      await sendLoginCode(code, { ip, purpose: "web", to: user.email });
    } catch (e) {
      console.error("sign-in code email failed:", e instanceof Error ? e.message : e);
      return back("mailfail");
    }
    const res = relRedirect(`/login/verify?next=${encodeURIComponent(next)}`);
    setChallenge(res, req, id);
    return res;
  }

  const res = relRedirect(next);
  await setSession(res, req, user);
  return res;
}

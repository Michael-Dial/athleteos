import type { NextRequest } from "next/server";
import { CHALLENGE_COOKIE } from "@/lib/auth";
import { relRedirect } from "@/lib/http";
import { safeNext } from "@/lib/safe-next";
import { verifyChallenge } from "@/lib/login-challenge";
import { clearChallenge, setSession, setTrust } from "@/lib/session-cookies";
import { userById } from "@/lib/users";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const r = await verifyChallenge(req.cookies.get(CHALLENGE_COOKIE)?.value, String(form.get("code") ?? ""), "web");
  if (!r.ok) {
    // Expired, locked or unknown challenges need a fresh password sign-in.
    if (r.reason === "invalid") return relRedirect(`/login/verify?error=invalid&next=${encodeURIComponent(safeNext(form.get("next")))}`);
    const res = relRedirect(`/login?error=${r.reason === "locked" ? "codelocked" : "codeexpired"}`);
    clearChallenge(res);
    return res;
  }
  const user = await userById(r.challenge.userId);
  if (!user || user.disabled) {
    const res = relRedirect("/login?error=1");
    clearChallenge(res);
    return res;
  }
  const res = relRedirect(safeNext(r.challenge.meta.next));
  await setSession(res, req, user);
  if (form.get("trust") === "on") await setTrust(res, req, user);
  clearChallenge(res);
  return res;
}

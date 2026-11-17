import type { NextRequest } from "next/server";
import { relRedirect } from "@/lib/http";
import { setSession } from "@/lib/session-cookies";
import { MIN_PASSWORD_LENGTH } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { consumeLink, peekLink } from "@/lib/users";

// Accept an invite or reset link: set the password and sign in. Public, like
// the login form; the link itself is the credential, so it is single use.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const token = String(form.get("token") ?? "");
  const back = (error: string) => relRedirect(`/invite/${encodeURIComponent(token)}?error=${error}`);
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return back("locked");
  if (!(await peekLink(token))) {
    recordFailure(ip);
    return back("expired");
  }
  const pw = String(form.get("password") ?? "");
  if (pw.length < MIN_PASSWORD_LENGTH) return back("short");
  if (pw !== String(form.get("confirm") ?? "")) return back("mismatch");
  const user = await consumeLink(token, pw);
  if (!user) return back("expired");
  clearFailures(ip);
  const res = relRedirect("/");
  await setSession(res, req, user);
  return res;
}

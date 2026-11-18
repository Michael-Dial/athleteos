import type { NextRequest } from "next/server";
import { relRedirect } from "@/lib/http";
import { setSession } from "@/lib/session-cookies";
import { RegistrationError, finishRegistration } from "@/lib/registration";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

// Web sign-up, step two: the right code creates the account and signs in.
// Not set up yet, so "/" sends them on to first-run setup (/welcome).
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const c = String(form.get("challenge") ?? "");
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return relRedirect(`/register/verify?c=${encodeURIComponent(c)}&error=locked`);
  try {
    const { user } = await finishRegistration(c, String(form.get("code") ?? ""));
    clearFailures(ip);
    const res = relRedirect("/");
    await setSession(res, req, user);
    return res;
  } catch (e) {
    if (!(e instanceof RegistrationError)) throw e;
    if (e.code === "bad_code") {
      recordFailure(ip);
      return relRedirect(`/register/verify?c=${encodeURIComponent(c)}&error=bad_code`);
    }
    // Anything else ends this attempt: back to the form, which explains why.
    return relRedirect(`/register?error=${e.code}`);
  }
}

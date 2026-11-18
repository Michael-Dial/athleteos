import type { NextRequest } from "next/server";
import { relRedirect } from "@/lib/http";
import { MIN_PASSWORD_LENGTH } from "@/lib/signin";
import { RegistrationError, startRegistration } from "@/lib/registration";
import { clientIp, isLocked } from "@/lib/throttle";

// Web sign-up, step one. Public, like the login form. The name and email go
// back on an error so nothing has to be retyped; the password never does.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const name = String(form.get("name") ?? "");
  const email = String(form.get("email") ?? "");
  const back = (error: string) => relRedirect(`/register?${new URLSearchParams({ error, name, email })}`);
  if (isLocked(clientIp(req.headers))) return back("locked");
  const pw = String(form.get("password") ?? "");
  if (pw.length < MIN_PASSWORD_LENGTH) return back("short_password");
  if (pw !== String(form.get("confirm") ?? "")) return back("mismatch");
  try {
    const p = await startRegistration({ name, email, password: pw, device: "Web" }, clientIp(req.headers));
    return relRedirect(`/register/verify?c=${p.challengeId}`);
  } catch (e) {
    if (e instanceof RegistrationError) return back(e.code);
    throw e;
  }
}

import type { NextRequest } from "next/server";
import { SESSION_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";
import { relRedirect } from "@/lib/http";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  // Only same-site relative paths; blocks open redirects like //evil.com.
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  // Throttled per IP: the login page is exposed through the public tunnel.
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return relRedirect(`/login?error=locked&next=${encodeURIComponent(next)}`);
  if (!(await checkPassword(String(form.get("password") ?? "")))) {
    recordFailure(ip);
    return relRedirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }
  clearFailures(ip);
  const { token, maxAge } = await createSessionToken();
  const res = relRedirect(next);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge,
  });
  return res;
}

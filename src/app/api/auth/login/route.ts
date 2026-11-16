import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, checkPassword, createSessionToken } from "@/lib/auth";

// Simple per-IP throttle: the login page is exposed through the public tunnel.
const attempts = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 15 * 60_000;
const MAX = 10;

function clientIp(req: NextRequest): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

function safeNext(v: FormDataEntryValue | null): string {
  const s = typeof v === "string" ? v : "/";
  // Only same-site relative paths; blocks open redirects like //evil.com.
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = safeNext(form.get("next"));
  const ip = clientIp(req);
  const now = Date.now();
  if (attempts.size > 1000) for (const [k, v] of attempts) if (v.reset <= now) attempts.delete(k);
  const a = attempts.get(ip);
  if (a && a.reset > now && a.n >= MAX) {
    return NextResponse.redirect(new URL(`/login?error=locked&next=${encodeURIComponent(next)}`, req.url), 303);
  }
  const ok = await checkPassword(String(form.get("password") ?? ""));
  if (!ok) {
    attempts.set(ip, a && a.reset > now ? { n: a.n + 1, reset: a.reset } : { n: 1, reset: now + WINDOW_MS });
    return NextResponse.redirect(new URL(`/login?error=1&next=${encodeURIComponent(next)}`, req.url), 303);
  }
  attempts.delete(ip);
  const { token, maxAge } = await createSessionToken();
  const res = NextResponse.redirect(new URL(next, req.url), 303);
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge,
  });
  return res;
}

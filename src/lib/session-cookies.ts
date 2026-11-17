import type { NextRequest, NextResponse } from "next/server";
import { CHALLENGE_COOKIE, SESSION_COOKIE, TRUST_COOKIE, createSessionToken, createTrustToken } from "./auth";
import type { User } from "./users";

function secure(req: NextRequest): boolean {
  return req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
}

export async function setSession(res: NextResponse, req: NextRequest, user: User): Promise<void> {
  const { token, maxAge } = await createSessionToken(user.id, user.session_epoch);
  res.cookies.set(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(req), path: "/", maxAge });
}

export async function setTrust(res: NextResponse, req: NextRequest, user: User): Promise<void> {
  const { token, maxAge } = await createTrustToken(user.id, user.trust_epoch);
  res.cookies.set(TRUST_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: secure(req), path: "/", maxAge });
}

export function setChallenge(res: NextResponse, req: NextRequest, id: string): void {
  // Only to the auth endpoints that need it, and only for the life of a code.
  res.cookies.set(CHALLENGE_COOKIE, id, { httpOnly: true, sameSite: "lax", secure: secure(req), path: "/", maxAge: 15 * 60 });
}

export function clearChallenge(res: NextResponse): void {
  res.cookies.delete(CHALLENGE_COOKIE);
}

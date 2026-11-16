import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authDisabled, verifySessionToken } from "./lib/auth";
import { publicUrl } from "./lib/http";

// Everything except the login page, the healthcheck and static assets requires
// a session: the app is reachable from the public tunnel.
export async function proxy(req: NextRequest) {
  if (authDisabled()) return NextResponse.next();
  const ok = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const next = req.nextUrl.pathname + req.nextUrl.search;
  const target = next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
  // Proxy redirects must be absolute; build them on the public host, not the bind address.
  return NextResponse.redirect(publicUrl(req.headers, req.nextUrl, target), 307);
}

export const config = {
  // Logout stays reachable without a session so a stale cookie can always be cleared.
  // /api/v1 authenticates itself (bearer token or session) inside apiRoute().
  // PWA files stay public: browsers fetch the manifest without cookies.
  matcher: ["/((?!login|api/health|api/auth/login|api/auth/logout|api/v1/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|offline.html|icons/).*)"],
};

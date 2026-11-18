import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authDisabled } from "./lib/auth";
import { publicUrl } from "./lib/http";
import { sessionUser } from "./lib/user-session";

// Admin-only pages. Their pages and actions check the role too; turning
// members away here means they get a plain 404 before anything renders.
const ADMIN_PATHS = ["/settings/users", "/settings/credentials", "/settings/backend", "/questionnaires"];

// Everything except the sign-in, sign-up and invite pages, the healthcheck and static assets requires
// a session: the app is reachable from the public tunnel.
export async function proxy(req: NextRequest) {
  if (authDisabled()) return NextResponse.next();
  // A session must name an active user and carry that user's current epoch.
  const user = await sessionUser(req.cookies.get(SESSION_COOKIE)?.value);
  if (user) {
    const path = req.nextUrl.pathname;
    if (!user.admin && ADMIN_PATHS.some((p) => path === p || path.startsWith(`${p}/`))) {
      return NextResponse.rewrite(new URL("/not-found-admin-only", req.url));
    }
    return NextResponse.next();
  }
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
  // /ow/api/v1 is the phone sync SDK's proxy to OW; OW checks the SDK's token.
  // PWA files stay public: browsers fetch the manifest without cookies.
  matcher: ["/((?!login|invite|forgot|register|api/health|api/auth/login|api/auth/invite|api/auth/register|api/auth/forgot|api/auth/logout|api/auth/verify|api/auth/resend|api/v1/|ow/api/v1/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|sw.js|offline.html|icons/).*)"],
};

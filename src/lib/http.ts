import { NextResponse } from "next/server";

/**
 * Redirect with a relative Location. Behind a tunnel or reverse proxy,
 * req.url carries the bind address (localhost/0.0.0.0), so an absolute URL
 * built from it would send the browser to an internal host. A relative
 * Location resolves against whatever URL the browser actually used.
 */
export function relRedirect(path: string, status: 303 | 307 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { location: path } });
}

/**
 * Absolute URL on the host the browser used, for places that require one
 * (proxy.ts redirects). Prefers the tunnel's forwarded headers, then Host,
 * because req.nextUrl in standalone mode reflects the bind address.
 */
export function publicUrl(headers: Headers, fallback: URL, path: string): URL {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host") || fallback.host;
  const proto = headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || fallback.protocol.replace(":", "");
  return new URL(path, `${proto}://${host}`);
}

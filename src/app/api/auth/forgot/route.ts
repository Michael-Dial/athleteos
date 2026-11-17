import type { NextRequest } from "next/server";
import { relRedirect } from "@/lib/http";
import { mailConfigured, sendAccountLink } from "@/lib/mail";
import { clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { EMAIL_RE, issueLink, userByEmail } from "@/lib/users";

// Self-service password reset. The answer is the same whether or not the
// address has an account, so this can't be used to find out who does; every
// request counts against the per-IP limit so it can't be used to spam inboxes.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const email = String(form.get("email") ?? "").trim();
  const ip = clientIp(req.headers);
  if (isLocked(ip)) return relRedirect("/forgot?error=locked");
  if (!EMAIL_RE.test(email)) return relRedirect("/forgot?error=email");
  recordFailure(ip);
  if (!(await mailConfigured())) return relRedirect("/forgot");
  const user = await userByEmail(email);
  if (user && !user.disabled) {
    const kind = user.password_hash ? "reset" : "invite";
    const { code, expiresAt } = await issueLink(user.id, kind);
    const proto = req.headers.get("x-forwarded-proto") ?? req.nextUrl.protocol.replace(":", "");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? req.nextUrl.host;
    try {
      await sendAccountLink(user.email, {
        kind, code, url: `${proto}://${host}/invite/${code}`, name: user.name, by: null,
        expires: expiresAt.toUTCString().replace(/:\d\d GMT$/, " UTC"),
      });
    } catch (e) {
      console.error("reset email failed:", e instanceof Error ? e.message : e);
    }
  }
  return relRedirect("/forgot?sent=1");
}

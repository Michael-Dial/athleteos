import type { NextRequest } from "next/server";
import { CHALLENGE_COOKIE } from "@/lib/auth";
import { relRedirect } from "@/lib/http";
import { clientIp } from "@/lib/throttle";
import { resendChallenge } from "@/lib/login-challenge";
import { sendLoginCode } from "@/lib/mail";
import { safeNext } from "@/lib/safe-next";
import { userById } from "@/lib/users";

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const next = encodeURIComponent(safeNext(form.get("next")));
  const r = await resendChallenge(req.cookies.get(CHALLENGE_COOKIE)?.value, "web");
  if (!r.ok) {
    if (r.reason === "unknown") return relRedirect("/login?error=codeexpired");
    return relRedirect(`/login/verify?error=${r.reason}${r.waitSec ? `&wait=${r.waitSec}` : ""}&next=${next}`);
  }
  const user = await userById(r.userId);
  if (!user || user.disabled) return relRedirect("/login?error=codeexpired");
  try {
    await sendLoginCode(r.code, { ip: clientIp(req.headers), purpose: "web", to: user.email });
  } catch {
    return relRedirect(`/login/verify?error=mailfail&next=${next}`);
  }
  return relRedirect(`/login/verify?sent=1&next=${next}`);
}

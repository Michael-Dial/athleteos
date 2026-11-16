import { SESSION_COOKIE } from "@/lib/auth";
import { relRedirect } from "@/lib/http";

export function POST() {
  const res = relRedirect("/login");
  res.cookies.delete(SESSION_COOKIE);
  return res;
}

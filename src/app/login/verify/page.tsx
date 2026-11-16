import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { CHALLENGE_COOKIE, TRUST_DAYS, maskEmail } from "@/lib/auth";
import { loginEmail } from "@/lib/mail";
import { IconLogo } from "@/components/icons";

export const metadata: Metadata = { title: "Enter code" };

const ERRORS: Record<string, string> = {
  invalid: "That code isn't right. Check the latest email and try again.",
  too_soon: "A code was sent moments ago. Give it a minute before asking again.",
  too_many: "That's the last code this sign-in can send. Use the newest email, or sign in again.",
  mailfail: "The new code couldn't be emailed. Try again shortly.",
};

export default async function VerifyPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; sent?: string; wait?: string }> }) {
  const sp = await searchParams;
  if (!(await cookies()).get(CHALLENGE_COOKIE)) redirect("/login");
  const to = loginEmail();
  const next = sp.next ?? "/";
  return (
    <main className="auth-wrap">
      <div className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>Check your email</h1>
          <p className="ink2">We sent a 6-digit code{to ? ` to ${maskEmail(to)}` : ""}. It expires in 10 minutes.</p>
        </div>
        <form action="/api/auth/verify" method="post" className="stack-lg">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            Code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
              style={{ fontFamily: "var(--display)", fontSize: 30, letterSpacing: "0.35em", textAlign: "center", minHeight: 56 }} />
          </label>
          <label className="row" style={{ fontSize: 14 }}>
            <input type="checkbox" name="trust" defaultChecked /> Trust this device for {TRUST_DAYS} days
          </label>
          {sp.error && <p className="field-error" role="alert">{ERRORS[sp.error] ?? "That didn't work. Try again."}{sp.wait ? ` (${sp.wait} s)` : ""}</p>}
          {sp.sent && !sp.error && <p className="small" role="status" style={{ color: "var(--good)" }}>A new code is on its way. Earlier codes no longer work.</p>}
          <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Verify and sign in</button>
        </form>
        <div className="row between small">
          <form action="/api/auth/resend" method="post">
            <input type="hidden" name="next" value={next} />
            <button className="btn sm" type="submit">Send a new code</button>
          </form>
          <Link href="/login">Start over</Link>
        </div>
      </div>
    </main>
  );
}

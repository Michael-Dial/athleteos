import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { maskEmail } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { IconLogo } from "@/components/icons";

export const metadata: Metadata = { title: "Confirm your email" };

export default async function RegisterVerifyPage({ searchParams }: { searchParams: Promise<{ c?: string; error?: string }> }) {
  const sp = await searchParams;
  if (!sp.c || !/^[0-9a-f-]{36}$/i.test(sp.c)) redirect("/register");
  const to = (await q1<{ email: string }>("SELECT meta->>'email' AS email FROM auth_challenge WHERE id = $1 AND purpose = 'register'", [sp.c]))?.email;
  return (
    <main className="auth-wrap">
      <div className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>Check your email</h1>
          <p className="ink2">We sent a 6-digit code{to ? ` to ${maskEmail(to)}` : ""}. It expires in 10 minutes.</p>
        </div>
        <form action="/api/auth/register/verify" method="post" className="stack-lg">
          <input type="hidden" name="challenge" value={sp.c} />
          <label className="field">
            Code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus
              style={{ fontFamily: "var(--display)", fontSize: 30, letterSpacing: "0.35em", textAlign: "center", minHeight: 56 }} />
          </label>
          {sp.error === "bad_code" && <p className="field-error" role="alert">That code isn&apos;t right. Check the email and try again.</p>}
          {sp.error === "locked" && <p className="field-error" role="alert">Too many attempts. Wait 15 minutes, then try again.</p>}
          <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Confirm and continue</button>
        </form>
        <p className="small muted">No email after a few minutes? Check spam, or <Link href="/register" className="auth-link">start again</Link>. If the address already has an account, the email says so instead.</p>
      </div>
    </main>
  );
}

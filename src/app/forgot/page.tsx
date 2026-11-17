import type { Metadata } from "next";
import Link from "next/link";
import { IconLogo } from "@/components/icons";
import { mailConfigured } from "@/lib/mail";
import { RESET_HOURS } from "@/lib/users";

export const metadata: Metadata = { title: "Reset password" };

const ERRORS: Record<string, string> = {
  email: "Enter the email address you sign in with.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
};

export default async function ForgotPage({ searchParams }: { searchParams: Promise<{ sent?: string; error?: string }> }) {
  const { sent, error } = await searchParams;
  const mail = await mailConfigured();
  return (
    <main className="auth-wrap">
      <div className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        {sent ? (
          <div className="stack">
            <h1 style={{ fontSize: 26 }}>Check your email</h1>
            <p className="ink2">If that address has an account, a reset code is on its way. It works once and expires in {RESET_HOURS} hours.</p>
            <Link className="btn primary" href="/invite" style={{ minHeight: 44 }}>Enter the code</Link>
            <Link className="small auth-link" href="/login">Back to sign in</Link>
          </div>
        ) : !mail ? (
          <div className="stack">
            <h1 style={{ fontSize: 26 }}>Reset your password</h1>
            <p className="ink2">This server can&apos;t send email yet, so ask your admin for a reset code. They can send one from Settings → Users.</p>
            <Link className="btn" href="/invite" style={{ minHeight: 44 }}>I have a code</Link>
            <Link className="small auth-link" href="/login">Back to sign in</Link>
          </div>
        ) : (
          <form action="/api/auth/forgot" method="post" className="stack-lg">
            <div className="stack" style={{ gap: 4 }}>
              <h1 style={{ fontSize: 26 }}>Reset your password</h1>
              <p className="ink2">We&apos;ll email you a code to choose a new one. Your current password keeps working until you do.</p>
            </div>
            <label className="field">Email<input type="email" name="email" autoComplete="username" required autoFocus /></label>
            {error && ERRORS[error] && <p className="field-error" role="alert">{ERRORS[error]}</p>}
            <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Send reset code</button>
            <Link className="small auth-link" href="/login">Back to sign in</Link>
          </form>
        )}
      </div>
    </main>
  );
}

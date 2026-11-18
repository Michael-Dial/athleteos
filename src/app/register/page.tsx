import type { Metadata } from "next";
import Link from "next/link";
import { IconLogo } from "@/components/icons";
import { MIN_PASSWORD_LENGTH } from "@/lib/signin";
import { registrationStatus } from "@/lib/registration";

export const metadata: Metadata = { title: "Create account" };
export const dynamic = "force-dynamic";

const ERRORS: Record<string, string> = {
  invalid_name: "Enter your name.",
  invalid_email: "Enter a valid email address.",
  short_password: `Use at least ${MIN_PASSWORD_LENGTH} characters for your password.`,
  mismatch: "The two passwords don't match.",
  too_many: "Too many sign-up attempts. Wait an hour, then try again.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
  mail_failed: "The confirmation email couldn't be sent. Try again in a few minutes.",
  code_expired: "That code expired. Fill this in again for a new one.",
  code_locked: "Too many wrong codes. Fill this in again for a new one.",
  unknown_challenge: "That sign-up ended. Fill this in again for a new code.",
  taken: "That address already has an account. Sign in, or use Forgot password.",
  closed: "New accounts can't be created here right now.",
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ error?: string; name?: string; email?: string }> }) {
  const sp = await searchParams;
  const status = await registrationStatus();
  return (
    <main className="auth-wrap">
      <div className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        {!status.available ? (
          <div className="stack">
            <h1 style={{ fontSize: 26 }}>Sign-up isn&apos;t open</h1>
            <p className="ink2">{status.reason}</p>
            <Link className="btn" href="/invite">Enter an invite code</Link>
            <Link className="small auth-link" href="/login">Go to sign in</Link>
          </div>
        ) : (
          <form action="/api/auth/register" method="post" className="stack-lg">
            <div className="stack" style={{ gap: 4 }}>
              <h1 style={{ fontSize: 26 }}>Create your account</h1>
              <p className="ink2">Readiness each morning from your own wearables and check-ins. We&apos;ll email a code to confirm your address.</p>
            </div>
            <label className="field">Your name
              <input name="name" autoComplete="name" defaultValue={sp.name ?? ""} maxLength={80} required autoFocus={!sp.name} />
            </label>
            <label className="field">Email
              <input type="email" name="email" autoComplete="username" defaultValue={sp.email ?? ""} required />
            </label>
            <label className="field">Password (at least {MIN_PASSWORD_LENGTH} characters)
              <input type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required autoFocus={Boolean(sp.name)} />
            </label>
            <label className="field">Same password again
              <input type="password" name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            </label>
            {sp.error && <p className="field-error" role="alert">{ERRORS[sp.error] ?? "That didn't work. Try again."}</p>}
            <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Create account</button>
            <div className="row between small" style={{ flexWrap: "wrap", gap: 8 }}>
              <Link href="/login" className="auth-link">I already have an account</Link>
              <Link href="/invite" className="auth-link">Have an invite code?</Link>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

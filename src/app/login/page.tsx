import type { Metadata } from "next";
import { IconLogo } from "@/components/icons";
import { installPasswordSet, needsFirstAdmin } from "@/lib/signin";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "1": "That email and password didn't match. Try again.",
  firstemail: "Emailed codes were on for this install, so use the address the codes went to. It becomes your sign-in email.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
  mailconfig: "Your account needs an emailed code, but email isn't set up on this server. Ask your admin. Admins can set LOGIN_2FA=off in the server environment and restart to get back in.",
  mailfail: "The sign-in code couldn't be emailed. Try again shortly. If email stays broken, an admin can set LOGIN_2FA=off in the server environment and restart.",
  codeexpired: "That code expired. Sign in again for a new one.",
  codelocked: "Too many wrong codes. Sign in again for a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string; email?: string }> }) {
  const { error, next, email } = await searchParams;
  const [first, installPw] = await Promise.all([needsFirstAdmin(), installPasswordSet()]);
  return (
    <main className="auth-wrap">
      <form action="/api/auth/login" method="post" className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        {first && !installPw && <p className="notice warn small">Set ATHLETEOS_PASSWORD in the app environment to enable sign-in.</p>}
        {first && installPw && (
          <p className="small ink2">
            First sign-in: enter your email and this install&apos;s password. That email becomes your sign-in and you become the admin, with your existing data.
          </p>
        )}
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="field">
          Email
          <input type="email" name="email" autoComplete="username" defaultValue={email ?? ""} required autoFocus={!email} />
        </label>
        <label className="field">
          Password
          <input type="password" name="password" autoComplete="current-password" required autoFocus={Boolean(email)} />
        </label>
        {error && <p className="field-error" role="alert">{ERRORS[error] ?? "Sign-in didn't work. Try again."}</p>}
        <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Sign in</button>
        <div className="row between small" style={{ flexWrap: "wrap", gap: 8 }}>
          <a href="/forgot" className="auth-link">Forgot password?</a>
          <a href="/invite" className="auth-link">Have an invite code?</a>
        </div>
      </form>
    </main>
  );
}

import type { Metadata } from "next";
import { IconLogo } from "@/components/icons";
import { passwordSource } from "@/lib/signin";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  "1": "That password didn't match. Try again.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
  mailconfig: "Email codes are on but email isn't set up, so no code can be sent. To get back in, set LOGIN_2FA=off in the server environment and restart.",
  mailfail: "The sign-in code couldn't be emailed. Try again shortly. If email stays broken, set LOGIN_2FA=off in the server environment and restart.",
  codeexpired: "That code expired. Sign in again for a new one.",
  codelocked: "Too many wrong codes. Sign in again for a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = (await passwordSource()) !== null;
  return (
    <main className="auth-wrap">
      <form action="/api/auth/login" method="post" className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        {!configured && <p className="notice warn small">Set ATHLETEOS_PASSWORD in the app environment to enable sign-in.</p>}
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="field">
          Password
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {error && <p className="field-error" role="alert">{ERRORS[error] ?? "Sign-in didn't work. Try again."}</p>}
        <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Sign in</button>
      </form>
    </main>
  );
}

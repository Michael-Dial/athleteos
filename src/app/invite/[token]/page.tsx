import type { Metadata } from "next";
import Link from "next/link";
import { IconLogo } from "@/components/icons";
import { maskEmail } from "@/lib/auth";
import { MIN_PASSWORD_LENGTH } from "@/lib/signin";
import { formatCode, normalizeCode, peekLink } from "@/lib/users";
import { q1 } from "@/lib/db";

export const metadata: Metadata = { title: "Set your password" };

const ERRORS: Record<string, string> = {
  short: `Use at least ${MIN_PASSWORD_LENGTH} characters.`,
  mismatch: "The two passwords don't match.",
  locked: "Too many attempts. Wait 15 minutes, then try again.",
};

export default async function InvitePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ error?: string }> }) {
  const { token } = await params;
  const { error } = await searchParams;
  const link = await peekLink(decodeURIComponent(token));
  const code = normalizeCode(decodeURIComponent(token));
  // Said without naming the backend: the person just sees their history is ready.
  const ready = link ? Boolean((await q1<{ ow_user_id: string | null }>("SELECT ow_user_id FROM athlete WHERE id = $1", [link.user.athlete_id]))?.ow_user_id) : false;
  return (
    <main className="auth-wrap">
      <div className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        {!link ? (
          <div className="stack">
            <h1 style={{ fontSize: 26 }}>That code didn&apos;t work</h1>
            <p className="ink2">Codes work once and expire. Check it against the email, or ask whoever invited you for a new one.</p>
            <Link className="btn" href="/invite">Enter a code</Link>
            <Link className="small" href="/login">Go to sign in</Link>
          </div>
        ) : (
          <form action="/api/auth/invite" method="post" className="stack-lg">
            <input type="hidden" name="token" value={code ? formatCode(code) : ""} />
            <div className="stack" style={{ gap: 4 }}>
              <h1 style={{ fontSize: 26 }}>{link.kind === "invite" ? `Welcome, ${link.user.name}` : "Set a new password"}</h1>
              <p className="ink2">You&apos;ll sign in as <b>{maskEmail(link.user.email)}</b>.{link.kind === "invite" && ready ? " Your device history is already connected." : ""}</p>
            </div>
            <input type="email" name="username" autoComplete="username" value={link.user.email} readOnly hidden />
            <label className="field">New password (at least {MIN_PASSWORD_LENGTH} characters)
              <input type="password" name="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required autoFocus />
            </label>
            <label className="field">Same password again
              <input type="password" name="confirm" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
            </label>
            {error && ERRORS[error] && <p className="field-error" role="alert">{ERRORS[error]}</p>}
            <button className="btn primary" type="submit" style={{ minHeight: 44 }}>{link.kind === "invite" ? "Set password and sign in" : "Save password and sign in"}</button>
          </form>
        )}
      </div>
    </main>
  );
}

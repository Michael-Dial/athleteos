import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { IconLogo } from "@/components/icons";
import { formatCode, normalizeCode } from "@/lib/users";

export const metadata: Metadata = { title: "Invite code" };

// Typing the code from an invite email (or one an admin read out) lands on the
// same page as following the email's link.
export default async function InviteCodePage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  const clean = code ? normalizeCode(code) : null;
  if (clean) redirect(`/invite/${formatCode(clean)}`);
  return (
    <main className="auth-wrap">
      <form method="get" className="card auth-card stack-lg">
        <div className="brand"><IconLogo size={24} />AthleteOS</div>
        <div className="stack" style={{ gap: 4 }}>
          <h1 style={{ fontSize: 26 }}>Have an invite code?</h1>
          <p className="ink2">Enter the code from your invite or password-reset email.</p>
        </div>
        <label className="field">Code
          <input name="code" defaultValue={code ?? ""} autoComplete="one-time-code" autoCapitalize="characters" spellCheck={false} required autoFocus
            placeholder="XXXX-XXXX-XXXX" maxLength={20} style={{ fontFamily: "var(--mono, ui-monospace, monospace)", fontSize: 20, letterSpacing: "0.12em", textAlign: "center" }} />
        </label>
        {code && <p className="field-error" role="alert">That doesn&apos;t look like a code. It has 12 letters and digits, like K7QM-2XRA-9TPD.</p>}
        <button className="btn primary" type="submit" style={{ minHeight: 44 }}>Continue</button>
        <Link className="small" href="/login">Back to sign in</Link>
      </form>
    </main>
  );
}

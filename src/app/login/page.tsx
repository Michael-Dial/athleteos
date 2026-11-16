import type { Metadata } from "next";
import { IconLogo } from "@/components/icons";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string; next?: string }> }) {
  const { error, next } = await searchParams;
  const configured = Boolean(process.env.ATHLETEOS_PASSWORD);
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 16 }}>
      <form action="/api/auth/login" method="post" className="card stack-lg" style={{ width: "100%", maxWidth: 360, padding: 24 }}>
        <div className="row" style={{ gap: 10 }}>
          <IconLogo size={22} style={{ color: "var(--accent)" }} />
          <h1 style={{ fontSize: 18 }}>AthleteOS</h1>
        </div>
        {!configured && (
          <p className="notice warn small">Set ATHLETEOS_PASSWORD in the app environment to enable sign-in.</p>
        )}
        <input type="hidden" name="next" value={next ?? "/"} />
        <label className="field">
          Password
          <input type="password" name="password" autoComplete="current-password" required autoFocus />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error === "locked" ? "Too many attempts. Wait 15 minutes, then try again." : "That password didn't match. Try again."}
          </p>
        )}
        <button className="btn primary" type="submit">Sign in</button>
      </form>
    </main>
  );
}

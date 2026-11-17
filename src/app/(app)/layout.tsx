import Link from "next/link";
import { cookies } from "next/headers";
import { TabBar, TopNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconLogo, IconLogout, IconSettings } from "@/components/icons";
import { authDisabled } from "@/lib/auth";
import { getCtx } from "@/lib/domain/context";
import { stopViewing } from "./settings/users/actions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("aos_theme")?.value === "light" ? "light" : "dark";
  const { viewing } = await getCtx();
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand"><IconLogo size={22} />AthleteOS</Link>
          <TopNav />
          <div className="topbar-tools">
            <ThemeToggle initial={theme} />
            <Link className="icon-btn" href="/settings" aria-label="Settings" title="Settings"><IconSettings size={18} /></Link>
            {!authDisabled() && (
              <form action="/api/auth/logout" method="post">
                <button className="icon-btn" type="submit" aria-label="Sign out" title="Sign out"><IconLogout size={18} /></button>
              </form>
            )}
          </div>
        </div>
      </header>
      {viewing && (
        <div className="view-banner" role="status">
          <span>Viewing <b>{viewing.userName}</b>&apos;s dashboards, read-only.</span>
          <form action={stopViewing}><button className="btn sm" type="submit">Back to mine</button></form>
        </div>
      )}
      <main className="main">{children}</main>
      <TabBar />
    </>
  );
}

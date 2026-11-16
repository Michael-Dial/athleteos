import Link from "next/link";
import { cookies } from "next/headers";
import { TabBar, TopNav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { IconLogo, IconLogout, IconSettings } from "@/components/icons";
import { authDisabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const theme = (await cookies()).get("aos_theme")?.value === "light" ? "light" : "dark";
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
      <main className="main">{children}</main>
      <TabBar />
    </>
  );
}

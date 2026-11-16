import Link from "next/link";
import { Nav } from "@/components/nav";
import { IconLogo, IconLogout } from "@/components/icons";
import { authDisabled } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand"><IconLogo size={20} /><span>AthleteOS</span></Link>
        <Nav />
        <div className="side-foot">
          <span>Device data via Open Wearables</span>
          {!authDisabled() && (
            <form action="/api/auth/logout" method="post">
              <button className="btn sm" type="submit"><IconLogout size={14} />Sign out</button>
            </form>
          )}
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

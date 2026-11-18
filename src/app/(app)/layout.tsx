import Link from "next/link";
import { TabBar, TopNav } from "@/components/nav";
import { IconLogo, IconSettings } from "@/components/icons";
import { ResponsiveTables } from "@/components/responsive-tables";
import { getCtx } from "@/lib/domain/context";
import { memberView } from "@/lib/current-user";
import { stopViewing } from "./settings/users/actions";

export const dynamic = "force-dynamic";

// Appearance and sign-out live in Settings, as on iOS; the bar carries only
// the brand (and, on wide screens, the section links and Settings).
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [{ viewing }, asMember] = await Promise.all([getCtx(), memberView()]);
  return (
    <>
      <header className="topbar">
        <div className="topbar-in">
          <Link href="/" className="brand" aria-label="AthleteOS, Today"><IconLogo size={22} /><span className="brand-word">AthleteOS</span></Link>
          <TopNav />
          <div className="topbar-tools">
            <Link className="icon-btn" href="/settings" aria-label="Settings" title="Settings"><IconSettings size={18} /></Link>
          </div>
        </div>
      </header>
      {/* Participant view of your own data is ordinary use, so it gets no banner; someone else's is read-only and says so. */}
      {viewing && (
        <div className="view-banner" role="status">
          <span>Viewing <b>{viewing.userName}</b>&apos;s dashboards{asMember ? " as they see them" : ""}, read-only.</span>
          <form action={stopViewing}><button className="btn sm" type="submit">Back to mine</button></form>
        </div>
      )}
      <main className="main">{children}</main>
      <TabBar />
      <ResponsiveTables />
    </>
  );
}

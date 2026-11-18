import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { actsAsAdmin, requireUser } from "@/lib/current-user";
import { startMemberView } from "./users/actions";
import { getCtx } from "@/lib/domain/context";
import { authDisabled } from "@/lib/auth";
import { AppearancePicker } from "@/components/theme-toggle";
import { IconRight } from "@/components/icons";

export const metadata: Metadata = { title: "Settings" };

// The Settings home: an inset grouped list you tap into, as on iOS.
function Row({ href, label, sub }: { href: string; label: string; sub?: string }) {
  return (
    <li>
      <Link href={href} className="group-row">
        <span className="stack" style={{ gap: 0 }}><span>{label}</span>{sub && <span className="small muted">{sub}</span>}</span>
        <IconRight size={18} className="muted" />
      </Link>
    </li>
  );
}

export default async function SettingsHome() {
  const [user, ctx, jar, admin] = await Promise.all([requireUser(), getCtx(), cookies(), actsAsAdmin()]);
  const saved = jar.get("aos_theme")?.value;
  const appearance = saved === "light" || saved === "dark" ? saved : "system";
  return (
    <div className="stack-lg" style={{ maxWidth: 640 }}>
      <ul className="group">
        <Row href="/settings/security" label={ctx.athlete.name} sub={user.email} />
      </ul>

      <section>
        <h2 className="group-title">Your data</h2>
        <ul className="group">
          <Row href="/settings/accounts" label="Connected accounts" sub="Wearables, Apple Health, Health Connect" />
          <Row href="/settings/devices" label="Device priority" sub="Which device leads each number" />
          <Row href="/settings/zones" label="Zones" sub="Heart rate, pace and power" />
          <Row href="/settings/analysis" label="Analysis" sub="Baselines, load, readiness" />
        </ul>
      </section>

      <section>
        <h2 className="group-title">App</h2>
        <ul className="group">
          <li className="group-row static">
            <span>Appearance</span>
            <AppearancePicker initial={appearance} />
          </li>
          <Row href="/settings/notifications" label="Notifications" sub="Morning check-in reminder" />
        </ul>
      </section>

      <section>
        <h2 className="group-title">Account</h2>
        <ul className="group">
          <Row href="/settings/security" label="Password and sign-in" sub="Emailed codes, devices, email address" />
          <Row href="/settings/api" label="API tokens" sub="For apps and scripts" />
        </ul>
      </section>

      {admin && (
        <section>
          <h2 className="group-title">Admin</h2>
          <ul className="group">
            <Row href="/settings/users" label="Users" sub="Invite people, roles, linked accounts" />
            <Row href="/settings/credentials" label="Credentials" sub="Device-data server, email" />
            <Row href="/settings/backend" label="Data backend" sub="Application, phone app" />
            <li>
              <form action={startMemberView}>
                <button type="submit" className="group-row">
                  <span className="stack" style={{ gap: 0, textAlign: "left" }}><span>See it as a participant</span><span className="small muted">Your dashboards without admin settings or controls</span></span>
                  <IconRight size={18} className="muted" />
                </button>
              </form>
            </li>
          </ul>
        </section>
      )}

      {!authDisabled() && (
        <form action="/api/auth/logout" method="post">
          <ul className="group"><li><button type="submit" className="group-row danger">Sign out</button></li></ul>
        </form>
      )}
    </div>
  );
}

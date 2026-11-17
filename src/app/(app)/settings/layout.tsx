import { Tabs } from "@/components/nav";
import { requireUser } from "@/lib/current-user";

// Admin-only tabs aren't shown to members; their pages also 404 for members.
const ALL = [
  { href: "/settings/accounts", label: "Connected accounts" },
  { href: "/settings", label: "Analysis" },
  { href: "/settings/devices", label: "Device priority" },
  { href: "/settings/zones", label: "Zones" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/api", label: "API tokens" },
  { href: "/settings/users", label: "Users", admin: true },
  { href: "/settings/credentials", label: "Credentials", admin: true },
  { href: "/settings/backend", label: "Data backend", admin: true },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const items = ALL.filter((t) => !t.admin || user.role === "admin").map(({ href, label }) => ({ href, label }));
  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p className="sub">Every tuning knob lives here; nothing in the analysis is hardcoded.</p></div></div>
      <Tabs items={items} />
      {children}
    </div>
  );
}

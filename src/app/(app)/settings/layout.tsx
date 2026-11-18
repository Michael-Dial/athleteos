import { actsAsAdmin } from "@/lib/current-user";
import { SettingsHead } from "@/components/settings-nav";

// Admin-only sections aren't shown to members; their pages also 404 for members.
const ALL = [
  { href: "/settings/accounts", label: "Connected accounts" },
  { href: "/settings/devices", label: "Device priority" },
  { href: "/settings/zones", label: "Zones" },
  { href: "/settings/analysis", label: "Analysis" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/security", label: "Security" },
  { href: "/settings/api", label: "API tokens" },
  { href: "/settings/users", label: "Users", admin: true },
  { href: "/settings/credentials", label: "Credentials", admin: true },
  { href: "/settings/backend", label: "Data backend", admin: true },
];

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const admin = await actsAsAdmin();
  const sections = ALL.filter((t) => !t.admin || admin).map(({ href, label }) => ({ href, label }));
  return (
    <div>
      <SettingsHead sections={sections} />
      {children}
    </div>
  );
}

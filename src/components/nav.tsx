"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconForm, IconHistory, IconPulse, IconSettings, IconToday, IconWatch } from "./icons";

const ITEMS = [
  { href: "/", label: "Today", icon: IconToday },
  { href: "/wearables", label: "Wearables", icon: IconWatch },
  { href: "/plan", label: "Plan", icon: IconCalendar },
  { href: "/history", label: "History", icon: IconHistory },
  { href: "/wellness", label: "Questionnaires", icon: IconForm },
  { href: "/readiness", label: "Readiness", icon: IconPulse },
  { href: "/settings", label: "Settings", icon: IconSettings },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {ITEMS.map(({ href, label, icon: Icon }) => {
        const active = href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`) || (href === "/wellness" && path.startsWith("/questionnaires"));
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} title={label}>
            <Icon size={18} />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function Tabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="tabs" role="navigation">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined}>{t.label}</Link>
      ))}
    </div>
  );
}

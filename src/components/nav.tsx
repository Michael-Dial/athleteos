"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconCalendar, IconHistory, IconMore, IconToday, IconTrend } from "./icons";

// Desktop top navigation. Settings and sign-out live in the top-bar tools.
const TOP = [
  { href: "/", label: "Today" },
  { href: "/readiness", label: "Readiness" },
  { href: "/review", label: "Review" },
  { href: "/trends", label: "Trends" },
  { href: "/history", label: "Training" },
  { href: "/plan", label: "Plan" },
  { href: "/wearables", label: "Body" },
  { href: "/wellness", label: "Check-in" },
];

// Phone bottom tabs: the four daily destinations plus everything else under More.
const TABS = [
  { href: "/", label: "Today", icon: IconToday },
  { href: "/plan", label: "Plan", icon: IconCalendar },
  { href: "/history", label: "Training", icon: IconHistory },
  { href: "/trends", label: "Trends", icon: IconTrend },
  { href: "/more", label: "More", icon: IconMore },
];

function isActive(path: string, href: string): boolean {
  if (href === "/") return path === "/";
  if (href === "/wellness") return path.startsWith("/wellness") || path.startsWith("/questionnaires");
  return path === href || path.startsWith(`${href}/`);
}

export function TopNav() {
  const path = usePathname();
  return (
    <nav className="topnav" aria-label="Main">
      {TOP.map((i) => <Link key={i.href} href={i.href} aria-current={isActive(path, i.href) ? "page" : undefined}>{i.label}</Link>)}
    </nav>
  );
}

export function TabBar() {
  const path = usePathname();
  const inMore = !TABS.slice(0, 4).some((t) => isActive(path, t.href));
  return (
    <nav className="tabbar" aria-label="Main">
      {TABS.map(({ href, label, icon: Icon }) => {
        const active = href === "/more" ? inMore : isActive(path, href);
        return <Link key={href} href={href} aria-label={label} aria-current={active ? "page" : undefined}><Icon size={22} /><span className="tab-label">{label}</span></Link>;
      })}
    </nav>
  );
}

export function Tabs({ items }: { items: { href: string; label: string }[] }) {
  const path = usePathname();
  return (
    <div className="tabs" role="navigation">
      {items.map((t) => (
        <Link key={t.href} href={t.href} aria-current={path === t.href || (t.href.split("/").length > 2 && path.startsWith(`${t.href}/`)) ? "page" : undefined}>{t.label}</Link>
      ))}
    </div>
  );
}

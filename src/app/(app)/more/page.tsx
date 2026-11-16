import Link from "next/link";
import type { Metadata } from "next";
import { IconForm, IconPulse, IconReview, IconSettings, IconWatch } from "@/components/icons";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  { href: "/readiness", label: "Readiness", sub: "Every pillar vs your baseline", icon: IconPulse },
  { href: "/review", label: "Weekly review", sub: "This week against the last three", icon: IconReview },
  { href: "/wearables", label: "Body", sub: "HRV, sleep, devices, coverage", icon: IconWatch },
  { href: "/wellness", label: "Check-in", sub: "Wellness and questionnaires", icon: IconForm },
  { href: "/settings", label: "Settings", sub: "Zones, devices, reminders, API", icon: IconSettings },
];

export default function MorePage() {
  return (
    <div className="stack-lg">
      <h1>More</h1>
      <div className="stack">
        {LINKS.map(({ href, label, sub, icon: Icon }) => (
          <Link key={href} href={href} className="card row" style={{ gap: 14, color: "var(--ink)", textDecoration: "none" }}>
            <Icon size={22} style={{ color: "var(--accent-text)" }} />
            <span className="stack" style={{ gap: 0 }}><b className="display" style={{ fontSize: 18, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</b><span className="small muted">{sub}</span></span>
          </Link>
        ))}
      </div>
    </div>
  );
}

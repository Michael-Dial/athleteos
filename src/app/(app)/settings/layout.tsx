import { Tabs } from "@/components/nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="page-head"><div><h1>Settings</h1><p className="sub">Every tuning knob lives here; nothing in the analysis is hardcoded.</p></div></div>
      <Tabs items={[
        { href: "/settings", label: "Analysis" },
        { href: "/settings/devices", label: "Device priority" },
        { href: "/settings/connections", label: "Open Wearables" },
      ]} />
      {children}
    </div>
  );
}

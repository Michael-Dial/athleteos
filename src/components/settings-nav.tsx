"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconLeft } from "./icons";
import { Tabs } from "./nav";

export interface SettingsSection { href: string; label: string }

/**
 * Settings is a list you tap into, as on iOS. A section page shows its own
 * title with a back link on phones, and the section tabs on wide screens.
 * The list itself (/settings) needs neither.
 */
export function SettingsHead({ sections }: { sections: SettingsSection[] }) {
  const path = usePathname();
  const current = sections.find((s) => path === s.href || path.startsWith(`${s.href}/`));
  if (path === "/settings") {
    return <div className="page-head"><div><h1>Settings</h1></div></div>;
  }
  return (
    <>
      <Link href="/settings" className="settings-back"><IconLeft size={18} />Settings</Link>
      <div className="page-head"><div><h1>{current?.label ?? "Settings"}</h1></div></div>
      <div className="settings-tabs"><Tabs items={sections} /></div>
    </>
  );
}

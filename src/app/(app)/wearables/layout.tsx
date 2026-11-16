import { Tabs } from "@/components/nav";
import { getCtx } from "@/lib/domain/context";
import { SetupBanner } from "@/components/setup-banner";

export default async function WearablesLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getCtx();
  return (
    <div>
      <div className="page-head">
        <div><h1>Wearables</h1><p className="sub">Every number names its device. Open Wearables keeps every source; nothing here is silently merged.</p></div>
      </div>
      <Tabs items={[
        { href: "/wearables", label: "Recovery" },
        { href: "/wearables/sleep", label: "Sleep" },
        { href: "/wearables/explore", label: "Timeseries" },
        { href: "/wearables/compare", label: "Compare devices" },
        { href: "/wearables/devices", label: "Devices" },
      ]} />
      {ctx.ow ? children : <SetupBanner ctx={ctx} />}
    </div>
  );
}

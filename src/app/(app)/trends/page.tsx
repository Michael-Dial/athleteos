import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getTrends, type DeviceSeries } from "@/lib/domain/trends";
import { Card, Empty } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { TimeChart, type Series } from "@/components/charts";

export const metadata: Metadata = { title: "Trends" };

const RANGES = [{ w: 13, label: "3 mo" }, { w: 26, label: "6 mo" }, { w: 52, label: "1 yr" }];
const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)"];
const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);

function DeviceChart({ title, hint, data, unit, digits = 0 }: { title: string; hint?: string; data: DeviceSeries[]; unit: string; digits?: number }) {
  const series: Series[] = data.map((d, i) => ({ id: d.device.key, label: d.device.name, color: SLOTS[i], kind: "line", points: d.points.map((p) => [dx(p.weekStart), p.value]) }));
  return (
    <Card title={title} hint={hint}>
      {series.length ? <TimeChart ariaLabel={title} series={series} unit={unit} digits={digits} height={220} /> : <Empty title="No data in this range" />}
    </Card>
  );
}

export default async function TrendsPage({ searchParams }: { searchParams: Promise<{ weeks?: string }> }) {
  const sp = await searchParams;
  const nWeeks = RANGES.some((r) => r.w === Number(sp.weeks)) ? Number(sp.weeks) : 26;
  const ctx = await getCtx();
  const t = await getTrends(ctx, nWeeks);
  const roll = t.load.map((w, i) => {
    const win = t.load.slice(Math.max(0, i - 3), i + 1);
    return win.length === 4 ? win.reduce((a, x) => a + x.load, 0) / 4 : null;
  });

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Long-term trends</h1><p className="sub">Weekly values. Overnight metrics are drawn per device: a change of device should not look like a change in you.</p></div>
        <div className="seg">{RANGES.map((r) => <Link key={r.w} href={`/trends?weeks=${r.w}`} className={r.w === nWeeks ? "on" : ""}>{r.label}</Link>)}</div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={t.owErrors} />
      <Card title="Training load" hint={`weekly ${t.loadMethods.map((m) => m.toUpperCase()).join(" + ") || "load"} · line = 4-week rolling mean`}>
        {t.load.some((w) => w.load > 0) ? (
          <TimeChart ariaLabel="Weekly training load" height={220}
            series={[
              { id: "load", label: "Weekly load (AU)", color: "var(--s1)", kind: "bar", points: t.load.map((w) => [dx(w.weekStart), w.load || null]) },
              { id: "roll", label: "4-week mean", color: "var(--s2)", kind: "line", points: t.load.map((w, i) => [dx(w.weekStart), roll[i]]) },
            ]} />
        ) : <Empty title="No rated sessions in this range">Rate sessions on History to build a load history.</Empty>}
      </Card>
      <div className="grid cols-2">
        <DeviceChart title="HRV (weekly geometric mean RMSSD)" hint="averaged on ln scale" data={t.hrv} unit="ms" />
        <DeviceChart title="Resting HR (weekly mean)" data={t.rhr} unit="bpm" />
        <DeviceChart title="Sleep (weekly mean time asleep)" data={t.sleep} unit="min" />
        <DeviceChart title="VO₂max (device estimates)" hint="each device's own algorithm; compare trends, not levels" data={t.vo2max} unit="ml/kg/min" digits={1} />
        <DeviceChart title="Body mass" hint="device values may be the profile weight you entered, not a measurement" data={t.bodyMass} unit="kg" digits={1} />
        <Card title="HRV variability (weekly CV of lnRMSSD)" hint="per device">
          {t.hrv.length ? (
            <TimeChart ariaLabel="Weekly CV of lnRMSSD" unit="%" digits={1} height={220}
              series={t.hrv.map((d, i) => ({ id: d.device.key, label: d.device.name, color: SLOTS[i], kind: "line" as const, points: d.points.map((p) => [dx(p.weekStart), p.cvPct ?? null] as [number, number | null]) }))} />
          ) : <Empty title="No HRV in this range" />}
        </Card>
      </div>
    </div>
  );
}

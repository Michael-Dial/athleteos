import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { coverageOrder, getNightly, METRIC_VALUE } from "@/lib/domain/nightly";
import { getReadiness } from "@/lib/domain/readiness";
import { addDays, fmtDate, todayIn } from "@/lib/dates";
import { finite, mean, sd } from "@/lib/stats/basic";
import { Card, Empty, SourceChip, fmt } from "@/components/ui";
import { OwErrors } from "@/components/setup-banner";
import { TimeChart, type Series } from "@/components/charts";
import { HrvChart } from "@/components/trend-charts";
import { RangeSeg, pickDays } from "@/components/range-seg";

export const metadata: Metadata = { title: "Recovery" };

const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];

export default async function RecoveryPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const sp = await searchParams;
  const days = pickDays(sp.days);
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const start = addDays(today, -days + 1);
  const [n, r] = await Promise.all([getNightly(ctx, start, today), getReadiness(ctx, today, { historyDays: days })]);
  const rows = n.rows;
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);

  // One colour per device, assigned by coverage so the same device keeps its
  // colour across both charts; devices past the 8th fold into the table only.
  const hrvKeys = coverageOrder(rows, "hrv");
  const rhrKeys = coverageOrder(rows, "rhr");
  const allKeys = [...new Set([...hrvKeys, ...rhrKeys])].slice(0, 8);
  const color = new Map(allKeys.map((k, i) => [k, SLOTS[i]]));
  const nameOf = new Map(rows.map((x) => [x.key, x.name]));
  const latestHrv = rows.filter((x) => METRIC_VALUE.hrv(x) != null).sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const seriesFor = (metric: "hrv" | "rhr", keys: string[]): Series[] =>
    keys.filter((k) => color.has(k)).map((k) => ({
      id: k, label: nameOf.get(k) ?? k, color: color.get(k)!, kind: "line" as const,
      points: rows.filter((x) => x.key === k).map((x) => [dx(x.date), METRIC_VALUE[metric](x)] as [number, number | null]),
    }));

  const table = [...new Set(rows.map((x) => x.key))].map((k) => {
    const mine = rows.filter((x) => x.key === k);
    const ln = finite(mine.map((x) => x.hrv)).filter((v) => v > 0).map(Math.log);
    const rhr = finite(mine.map((x) => x.rhr));
    const mLn = mean(ln), sLn = sd(ln);
    return { k, name: nameOf.get(k)!, nights: mine.length, hrvN: ln.length, gm: mLn != null ? Math.exp(mLn) : null, mLn, sLn, cv: mLn && sLn ? (sLn / mLn) * 100 : null, rhr: mean(rhr), rhrSd: sd(rhr) };
  }).filter((t) => t.hrvN || t.rhr != null).sort((a, b) => b.hrvN - a.hrvN);

  return (
    <div className="stack-lg">
      <div className="row between">
        <p className="small muted">Overnight HRV and resting HR per device. Baselines and status use one device only: {r.hrv.device ? <SourceChip name={r.hrv.device.name} fallback={r.hrv.device.fallback} /> : latestHrv ? "none reporting recently" : "none yet"}</p>
        <RangeSeg base="/wearables" days={days} />
      </div>
      <OwErrors errors={[n.owError, ...r.errors]} />
      <Card title={<>HRV status (<span className="nocaps">lnRMSSD</span>)</>} hint={`${ctx.settings.hrv.rollingDays}-day mean vs ${ctx.settings.hrv.baselineDays}-day baseline ± ${ctx.settings.hrv.swcSd} SD`}>
        {r.hrv.device ? <HrvChart series={r.hrv.series} height={260} /> : latestHrv ? (
          // HRV exists in the window but no device reported it recently, which is
          // what status needs. Saying "no HRV nights" here contradicted the chart below.
          <Empty title="No recent HRV, so no current status"
            action={<Link className="btn sm" href="/wearables/coverage">Check device sync</Link>}>
            Status needs a reading from the last few nights. The latest is {fmtDate(latestHrv.date, { month: "short", day: "numeric" })} from {latestHrv.name}.
          </Empty>
        ) : (
          <Empty title={`No HRV in the last ${days} days`}
            action={<Link className="btn sm" href="/settings/accounts">Open connected accounts</Link>}>
            HRV status starts once a connected device reports overnight HRV.
          </Empty>
        )}
      </Card>
      <div className="grid cols-2">
        <Card title="Nightly RMSSD by device" hint="raw ms; devices differ in window and algorithm">
          <TimeChart ariaLabel="Nightly RMSSD by device" series={seriesFor("hrv", hrvKeys)} unit="ms" />
        </Card>
        <Card title="Resting HR by device" hint="bpm">
          <TimeChart ariaLabel="Resting heart rate by device" series={seriesFor("rhr", rhrKeys)} unit="bpm" />
        </Card>
      </div>
      <Card title="Per-device summary" hint={`last ${days} days · HRV aggregated on ln scale`} className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Device</th><th className="num">Nights</th><th className="num">HRV nights</th><th className="num">Geometric mean RMSSD</th><th className="num">Mean lnRMSSD</th><th className="num">SD ln</th><th className="num">CV ln %</th><th className="num">RHR mean ± SD</th></tr></thead>
            <tbody>
              {table.map((t) => (
                <tr key={t.k}>
                  <td><span className="row" style={{ gap: 6 }}>{color.has(t.k) && <span className="dot" style={{ background: color.get(t.k) }} />}{t.name}</span></td>
                  <td className="num">{t.nights}</td>
                  <td className="num">{t.hrvN}</td>
                  <td className="num">{t.gm != null ? `${fmt(t.gm, 1)} ms` : "—"}</td>
                  <td className="num">{fmt(t.mLn, 3)}</td>
                  <td className="num">{fmt(t.sLn, 3)}</td>
                  <td className="num">{fmt(t.cv, 1)}</td>
                  <td className="num">{t.rhr != null ? `${fmt(t.rhr, 1)} ± ${fmt(t.rhrSd, 1)}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

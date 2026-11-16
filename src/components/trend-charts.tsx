import type { HrvPoint } from "@/lib/stats/hrv";
import type { AcwrPoint } from "@/lib/stats/load";
import { TimeChart, type Series } from "./charts";

const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);

/** Nightly lnRMSSD (dots), its rolling mean (line) and the SWC normal range (band), all on ln scale. */
export function HrvChart({ series, height = 220 }: { series: HrvPoint[]; height?: number }) {
  if (!series.some((p) => p.ln != null)) {
    return <p className="small muted">No HRV nights in this window.</p>;
  }
  const s: Series[] = [
    { id: "ln", label: "Nightly lnRMSSD", color: "var(--s1)", kind: "dots", points: series.map((p) => [dx(p.date), p.ln]) },
    { id: "roll", label: "7-day mean", color: "var(--s2)", kind: "line", points: series.map((p) => [dx(p.date), p.rollingLn]) },
  ];
  return (
    <TimeChart
      ariaLabel="HRV trend on log scale with normal range"
      series={s}
      band={{ label: "Normal range (SWC)", points: series.map((p) => [dx(p.date), p.swcLow, p.swcHigh]) }}
      digits={2}
      height={height}
    />
  );
}

/** Daily load bars and ACWR line as two charts: different units never share an axis. */
export function LoadCharts({ series, low, high, compact }: { series: AcwrPoint[]; low: number; high: number; compact?: boolean }) {
  if (!series.some((p) => p.load > 0)) return <p className="small muted">No rated sessions in this window.</p>;
  return (
    <div className="stack">
      <TimeChart ariaLabel="Daily training load" height={compact ? 130 : 180}
        series={[{ id: "load", label: "Daily load (AU)", color: "var(--s1)", kind: "bar", points: series.map((p) => [dx(p.date), p.load || null]) }]} />
      <TimeChart ariaLabel="Acute to chronic workload ratio" height={compact ? 120 : 160} digits={2}
        refs={[{ y: high, label: `${high}` }, { y: low, label: `${low}` }]}
        series={[{ id: "acwr", label: "ACWR", color: "var(--s7)", kind: "line", points: series.map((p) => [dx(p.date), p.acwr]) }]} />
    </div>
  );
}

import type { OwSleepStageInterval } from "@/lib/ow/types";
import { foldStage } from "@/lib/ow/stages";

const ROWS = ["awake", "rem", "light", "deep"] as const;
const COLOR: Record<string, string> = { awake: "var(--st-awake)", rem: "var(--st-rem)", light: "var(--st-light)", deep: "var(--st-deep)", sleeping: "var(--st-light)", unknown: "var(--st-unknown)" };
const LABEL: Record<string, string> = { awake: "Awake", rem: "REM", light: "Light", deep: "Deep" };

/** Stage timeline; manually imported PSG stages are folded via vendor_stage first. */
export function Hypnogram({ intervals, tz, height = 120 }: { intervals: OwSleepStageInterval[]; tz: string; height?: number }) {
  const ivs = intervals.filter((i) => i.stage !== "in_bed");
  if (!ivs.length) return <p className="small muted">This session has no stage timeline.</p>;
  const t0 = Math.min(...ivs.map((i) => Date.parse(i.start_time)));
  const t1 = Math.max(...ivs.map((i) => Date.parse(i.end_time)));
  const W = 1000, L = 0, rowH = (height - 20) / ROWS.length;
  const H = height - 20;
  const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L);
  const rowOf = (s: string) => {
    const r = ROWS.indexOf(s as (typeof ROWS)[number]);
    return r === -1 ? (s === "sleeping" ? 2 : 0) : r;
  };
  const hours: number[] = [];
  for (let h = Math.ceil(t0 / 3600000) * 3600000; h <= t1; h += 3600000) hours.push(h);
  const fmt = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", timeZone: tz });
  return (
    <div className="chart" style={{ display: "grid", gridTemplateColumns: "44px 1fr", columnGap: 6 }}>
      <div style={{ display: "flex", flexDirection: "column", height: height - 20, marginTop: 0 }}>
        {ROWS.map((r) => <span key={r} className="axis-label small muted" style={{ flex: 1, display: "flex", alignItems: "center", fontSize: 11 }}>{LABEL[r]}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: height - 20 }} role="img" aria-label="Sleep stage timeline">
        {ROWS.map((r, i) => (
          <g key={r}>
            <line className="grid-line" x1={L} x2={W} y1={i * rowH + rowH} y2={i * rowH + rowH} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
        {ivs.map((iv, i) => {
          const s = foldStage(iv);
          const r = rowOf(s);
          return (
            <rect key={i} x={x(Date.parse(iv.start_time))} width={Math.max(0.5, x(Date.parse(iv.end_time)) - x(Date.parse(iv.start_time)))}
              y={r * rowH + 3} height={rowH - 6} fill={COLOR[s] ?? COLOR.unknown}>
              <title>{`${LABEL[s] ?? s}${iv.vendor_stage ? ` (${iv.vendor_stage})` : ""} · ${fmt(Date.parse(iv.start_time))}`}</title>
            </rect>
          );
        })}
      </svg>
      <span />
      <div style={{ position: "relative", height: 16 }} className="small muted">
        {hours.map((h) => (
          <span key={h} style={{ position: "absolute", left: `${((h - t0) / (t1 - t0 || 1)) * 100}%`, transform: "translateX(-50%)", fontSize: 11 }}>{fmt(h)}</span>
        ))}
      </div>
      <span />
      <div className="legend" style={{ marginTop: 4 }}>
        {ROWS.map((r) => <span key={r} className="row" style={{ gap: 5 }}><i style={{ background: COLOR[r] }} />{LABEL[r]}</span>)}
      </div>
    </div>
  );
}

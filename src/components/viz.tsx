// Small server-rendered graphics for dashboard tiles. They carry their
// numbers in <title> tooltips; pages link to full interactive charts.

import type { SportFamily } from "@/lib/sports";

export type VizState = "ok" | "watch" | "flag" | "nodata";
const STATE_COLOR: Record<VizState, string> = { ok: "var(--good-fill)", watch: "var(--warn-fill)", flag: "var(--bad-fill)", nodata: "var(--line-strong)" };

/** Semicircular readiness gauge over -3..+3 SD with red / amber / green arcs. */
export function ReadinessGauge({ index, state, label, zFlag, watchZ, size = 240 }: { index: number | null; state: VizState; label: string; zFlag: number; watchZ: number; size?: number }) {
  const w = size, h = size * 0.62, cx = w / 2, cy = h - 8, r = w / 2 - 18;
  const ang = (v: number) => Math.PI * (1 - (Math.max(-3, Math.min(3, v)) + 3) / 6);
  const pt = (v: number, rr = r) => [cx + rr * Math.cos(ang(v)), cy - rr * Math.sin(ang(v))] as const;
  const arc = (a: number, b: number) => {
    const [x1, y1] = pt(a), [x2, y2] = pt(b);
    return `M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 0 1 ${x2.toFixed(1)},${y2.toFixed(1)}`;
  };
  const segs: [number, number, string][] = [[-3, -zFlag, "var(--bad-fill)"], [-zFlag, -watchZ, "var(--warn-fill)"], [-watchZ, 3, "var(--good-fill)"]];
  const marker = index != null ? pt(index, r) : null;
  return (
    <svg viewBox={`0 0 ${w} ${h + 46}`} width="100%" style={{ maxWidth: size }} role="img" aria-label={`Readiness ${label}${index != null ? `, index ${index.toFixed(2)} SD` : ""}`}>
      {segs.map(([a, b, c]) => (
        <path key={c} d={arc(a + 0.04, b - 0.04)} stroke={index == null ? "var(--surface-3)" : c} strokeWidth={14} fill="none" strokeLinecap="butt" opacity={index == null ? 1 : 0.9} />
      ))}
      {marker && (
        <g>
          <circle cx={marker[0]} cy={marker[1]} r={11} fill="var(--surface)" />
          <circle cx={marker[0]} cy={marker[1]} r={7} fill="var(--ink)" />
        </g>
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fontFamily="var(--display)" fontWeight={700} fontSize={size * 0.135} fill={index == null ? "var(--muted)" : ({ ok: "var(--good)", watch: "var(--warn)", flag: "var(--bad)", nodata: "var(--muted)" } as const)[state]} letterSpacing="0.03em">{label.toUpperCase()}</text>
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={13} fill="var(--muted)">{index != null ? `index ${index > 0 ? "+" : index < 0 ? "−" : ""}${Math.abs(index).toFixed(1)} SD` : "needs two pillars with baselines"}</text>
      <text x={18} y={cy + 30} fontSize={11} fill="var(--muted)">−3</text>
      <text x={w - 18} y={cy + 30} fontSize={11} fill="var(--muted)" textAnchor="end">+3</text>
    </svg>
  );
}

/** Position on a shared -3..+3 SD scale (positive = favourable), with the normal zone shaded. */
export function ZScale({ z, state, watchZ, title, width = 200 }: { z: number | null; state: VizState; watchZ: number; title: string; width?: number }) {
  const W = width, H = 22, x = (v: number) => 6 + ((Math.max(-3, Math.min(3, v)) + 3) / 6) * (W - 12);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" role="img" aria-label={title}>
      <title>{title}</title>
      <rect x={6} y={9} width={W - 12} height={4} rx={2} fill="var(--surface-3)" />
      <rect x={x(-watchZ)} y={7} width={x(watchZ) - x(-watchZ)} height={8} rx={2} fill="var(--line-strong)" opacity={0.55} />
      <line x1={x(0)} x2={x(0)} y1={4} y2={18} stroke="var(--muted)" strokeWidth={1} />
      {z != null && <circle cx={x(z)} cy={11} r={6} fill={STATE_COLOR[state]} stroke="var(--surface)" strokeWidth={2} />}
    </svg>
  );
}

/** Line sparkline with optional normal band and an emphasised last point. */
export function Sparkline({ values, band, width = 160, height = 40, color = "var(--graph)", title, kind = "line" }: {
  values: (number | null)[]; band?: [number, number] | null; width?: number; height?: number; color?: string; title: string; kind?: "line" | "bars";
}) {
  const v = values.filter((x): x is number => x != null);
  if (v.length < 2 && kind === "line") return <svg width={width} height={height} role="img" aria-label={`${title}: not enough data`}><title>{`${title}: not enough data`}</title><line x1={0} x2={width} y1={height / 2} y2={height / 2} stroke="var(--line)" strokeDasharray="3 4" /></svg>;
  let lo = Math.min(...v, ...(band ?? [])), hi = Math.max(...v, ...(band ?? []));
  if (kind === "bars") lo = 0;
  if (hi === lo) { hi += 1; lo -= kind === "bars" ? 0 : 1; }
  const pad = 4;
  const sx = (i: number) => pad + (i / Math.max(1, values.length - 1)) * (width - pad * 2);
  const sy = (y: number) => height - pad - ((y - lo) / (hi - lo)) * (height - pad * 2);
  // Missing days are bridged: a sparkline shows the trend, gaps are visible as straight runs.
  let d = "", lastI = -1;
  values.forEach((y, i) => { if (y == null) return; d += `${lastI < 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(y).toFixed(1)}`; lastI = i; });
  const bw = Math.max(2, (width - pad * 2) / values.length - 2);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label={title}>
      <title>{title}</title>
      {band && <rect x={0} y={sy(band[1])} width={width} height={Math.max(1, sy(band[0]) - sy(band[1]))} fill="var(--ink)" opacity={0.07} />}
      {kind === "bars"
        ? values.map((y, i) => (y ? <rect key={i} x={sx(i) - bw / 2} y={sy(y)} width={bw} height={Math.max(1, sy(0) - sy(y))} rx={1.5} fill={color} opacity={i === values.length - 1 ? 1 : 0.65} /> : null))
        : <path d={d} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {kind === "line" && lastI >= 0 && <circle cx={sx(lastI)} cy={sy(values[lastI]!)} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={1.5} />}
    </svg>
  );
}

// Fixed sport colours from the categorical palette (assigned by family, never by rank).
export const SPORT_COLOR: Record<SportFamily, string> = {
  run: "var(--s1)", ride: "var(--s2)", swim: "var(--s3)", strength: "var(--s4)", row: "var(--s5)",
  ski: "var(--s6)", walk: "var(--s7)", mobility: "var(--s8)", team: "var(--line-strong)", other: "var(--line-strong)",
};

export interface DayColumn {
  date: string;
  label: string;
  isToday: boolean;
  plannedMin: number;
  sessions: { family: SportFamily; minutes: number; title: string }[];
}

/** One column per day: done sessions stacked by sport, planned minutes as an outline. */
export function WeekStrip({ days, height = 150 }: { days: DayColumn[]; height?: number }) {
  const max = Math.max(60, ...days.map((d) => Math.max(d.plannedMin, d.sessions.reduce((a, s) => a + s.minutes, 0))));
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${days.length}, 1fr)`, gap: 8, alignItems: "end" }}>
      {days.map((d) => {
        const done = d.sessions.reduce((a, s) => a + s.minutes, 0);
        return (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6 }}>
            <div style={{ position: "relative", height, display: "flex", flexDirection: "column-reverse", gap: 2 }} title={`${d.label}: ${Math.round(done)} min done${d.plannedMin ? `, ${Math.round(d.plannedMin)} min planned` : ""}`}>
              {d.plannedMin > 0 && (
                <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: `${(d.plannedMin / max) * 100}%`, border: "2px dashed var(--line-strong)", borderRadius: 6 }} aria-hidden="true" />
              )}
              {d.sessions.map((s, i) => (
                <div key={i} style={{ height: `${(s.minutes / max) * 100}%`, minHeight: 4, background: SPORT_COLOR[s.family], borderRadius: 4, marginInline: 4 }} title={`${s.title}: ${Math.round(s.minutes)} min`} />
              ))}
            </div>
            <div style={{ textAlign: "center", fontFamily: "var(--display)", fontWeight: 600, letterSpacing: "0.06em", fontSize: 13, color: d.isToday ? "var(--accent-text)" : "var(--muted)" }}>{d.label}</div>
          </div>
        );
      })}
    </div>
  );
}

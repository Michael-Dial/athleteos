"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { fmtDuration } from "@/lib/dates";

export type Pt = [number, number | null];

export interface Series {
  id: string;
  label: string;
  /** CSS colour, normally a categorical slot var like "var(--s1)". */
  color: string;
  kind?: "line" | "bar" | "dots";
  points: Pt[];
  dashed?: boolean;
  /** Hide from legend/tooltip (e.g. a faint raw-values layer). */
  quiet?: boolean;
}

export interface Band {
  label: string;
  points: [number, number | null, number | null][];
}

interface Props {
  series: Series[];
  band?: Band;
  refs?: { y: number; label: string }[];
  height?: number;
  xKind?: "date" | "time" | "datetime" | "number";
  xUnit?: string;
  tz?: string;
  unit?: string;
  digits?: number;
  yMin?: number;
  yMax?: number;
  zeroBased?: boolean;
  /** "duration": values are minutes; ticks fall on whole hours and read "7h", the tooltip "7h 23m". */
  yAs?: "duration";
  /** Shown instead of the default "No data in this window." so a page can offer a way out. */
  empty?: ReactNode;
  ariaLabel: string;
}

const PAD = { l: 44, r: 12, t: 8, b: 24 };

function useWidth<T extends HTMLElement>(initial = 720) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(initial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Follow the container down to phone widths at the largest text sizes; below
    // ~140 pt the axes stop being legible, so that is the floor.
    const ro = new ResizeObserver(([e]) => setW(Math.max(140, Math.floor(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function niceTicks(min: number, max: number, count = 4): number[] {
  if (!(max > min)) return [min];
  const span = max - min;
  const step0 = span / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count + 0.5) ?? step0;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(10)));
  return out;
}

/** Ticks on whole hours (or every 2 h for wide spans) for minute-valued axes. */
function hourTicks(min: number, max: number): number[] {
  const step = (max - min) / 60 > 6 ? 120 : 60;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) out.push(v);
  return out.length ? out : niceTicks(min, max);
}

function fmtX(x: number, kind: "date" | "time" | "datetime" | "number", tz?: string, long = false, xUnit = ""): string {
  if (kind === "number") return `${x.toLocaleString("en-US", { maximumFractionDigits: 1 })}${xUnit}`;
  const d = new Date(x);
  if (kind === "datetime") {
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", ...(long ? { minute: "2-digit" } : {}), timeZone: tz });
  }
  if (kind === "date") {
    return d.toLocaleDateString("en-US", long ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", timeZone: "UTC" });
  }
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", ...(long ? { second: "2-digit" } : {}), timeZone: tz });
}

export function dateX(d: string): number {
  return Date.parse(`${d}T12:00:00Z`);
}

export function TimeChart({ series, band, refs = [], height = 220, xKind = "date", xUnit, tz, unit = "", digits = 0, yMin, yMax, zeroBased, yAs, empty, ariaLabel }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const xs = new Set<number>();
    const ys: number[] = [];
    for (const s of series) for (const [x, y] of s.points) { xs.add(x); if (y != null) ys.push(y); }
    if (band) for (const [x, lo, hi] of band.points) { xs.add(x); if (lo != null) ys.push(lo); if (hi != null) ys.push(hi); }
    for (const r of refs) ys.push(r.y);
    const xList = [...xs].sort((a, b) => a - b);
    const hasBars = series.some((s) => s.kind === "bar");
    let lo = yMin ?? (ys.length ? Math.min(...ys) : 0);
    let hi = yMax ?? (ys.length ? Math.max(...ys) : 1);
    if (zeroBased || hasBars) lo = Math.min(0, lo);
    if (hi === lo) { hi += 1; lo -= hasBars ? 0 : 1; }
    const padY = (hi - lo) * 0.08;
    if (yMax == null) hi += padY;
    if (yMin == null && !(zeroBased || hasBars)) lo -= padY;
    const x0 = xList[0] ?? 0;
    const x1 = xList.at(-1) ?? 1;
    const plotW = width - PAD.l - PAD.r;
    const plotH = height - PAD.t - PAD.b;
    // Bars need half a slot of room at each end.
    const slot = xList.length > 1 ? plotW / xList.length : plotW;
    const inset = hasBars ? slot / 2 : 0;
    const sx = (x: number) => PAD.l + inset + (x1 === x0 ? (plotW - 2 * inset) / 2 : ((x - x0) / (x1 - x0)) * (plotW - 2 * inset));
    const sy = (y: number) => PAD.t + plotH - ((y - lo) / (hi - lo)) * plotH;
    return { xList, lo, hi, sx, sy, plotW, plotH, slot, hasBars };
  }, [series, band, refs, width, height, yMin, yMax, zeroBased]);

  const { xList, lo, hi, sx, sy, plotH, slot } = geo;
  const yTicks = yAs === "duration" ? hourTicks(lo, hi) : niceTicks(lo, hi);
  const xTickEvery = Math.max(1, Math.ceil(xList.length / Math.max(2, Math.floor(width / 90))));
  const barSeries = series.filter((s) => s.kind === "bar");
  const barW = Math.max(2, Math.min(24, (slot - 2) / Math.max(1, barSeries.length)));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    if (!xList.length) return;
    const rect = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0, bd = Infinity;
    for (let i = 0; i < xList.length; i++) {
      const d = Math.abs(sx(xList[i]) - px);
      if (d < bd) { bd = d; best = i; }
    }
    setHover(best);
  }

  const hx = hover != null ? xList[hover] : null;
  const fmtY = (v: number) => yAs === "duration" ? fmtDuration(v) : `${v.toLocaleString("en-US", { maximumFractionDigits: digits, minimumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`;
  const visible = series.filter((s) => !s.quiet);

  const hasData = series.some((s) => s.points.some(([, y]) => y != null));
  if (!xList.length || !hasData) {
    return empty ?? <div className="empty"><p className="small">No data in this window.</p></div>;
  }

  return (
    <div className="chart" ref={ref}>
      {(visible.length > 1 || band) && (
        <div className="legend">
          {visible.map((s) => (
            <span key={s.id} className="row" style={{ gap: 5 }}>
              <i className={s.kind === "bar" ? "" : "line"} style={{ background: s.color }} />{s.label}
            </span>
          ))}
          {band && <span className="row" style={{ gap: 5 }}><i style={{ background: "var(--accent)", opacity: 0.2 }} />{band.label}</span>}
        </div>
      )}
      <svg width={width} height={height} role="img" aria-label={ariaLabel}>
        {yTicks.map((t) => (
          <g key={t}>
            <line className="grid-line" x1={PAD.l} x2={width - PAD.r} y1={sy(t)} y2={sy(t)} />
            <text className="axis-label" x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">{yAs === "duration" ? `${t / 60}h` : t.toLocaleString("en-US", { maximumFractionDigits: 2 })}</text>
          </g>
        ))}
        {band && (
          <path className="band" d={bandPath(band.points, sx, sy)} />
        )}
        {refs.map((r) => (
          <g key={r.label}>
            <line x1={PAD.l} x2={width - PAD.r} y1={sy(r.y)} y2={sy(r.y)} stroke="var(--line-strong)" strokeDasharray="4 4" />
            <text className="axis-label" x={width - PAD.r} y={sy(r.y) - 4} textAnchor="end">{r.label}</text>
          </g>
        ))}
        {barSeries.map((s, si) =>
          s.points.map(([x, y]) => {
            if (y == null) return null;
            const top = sy(Math.max(0, y));
            const base = sy(Math.max(lo, 0));
            const off = (si - (barSeries.length - 1) / 2) * barW;
            return <rect key={`${s.id}-${x}`} x={sx(x) - barW / 2 + off + 1} width={barW - 2} y={Math.min(top, base)} height={Math.max(1, Math.abs(base - top))} rx={Math.min(3, barW / 4)} fill={s.color} opacity={hx != null && hx !== x ? 0.55 : 1} />;
          }),
        )}
        {series.filter((s) => s.kind !== "bar").map((s) =>
          s.kind === "dots" ? (
            <g key={s.id}>
              {s.points.map(([x, y]) => (y == null ? null : <circle key={x} cx={sx(x)} cy={sy(y)} r={2.5} fill={s.color} opacity={s.quiet ? 0.45 : 0.9} />))}
            </g>
          ) : (
            <path key={s.id} d={linePath(s.points, sx, sy)} fill="none" stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "5 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
          ),
        )}
        <line className="baseline" x1={PAD.l} x2={width - PAD.r} y1={PAD.t + plotH} y2={PAD.t + plotH} />
        {xList.map((x, i) => (i % xTickEvery === 0 ? <text key={x} className="axis-label" x={sx(x)} y={height - 6} textAnchor="middle">{fmtX(x, xKind, tz, false, xUnit)}</text> : null))}
        {hx != null && (
          <g>
            <line className="crosshair" x1={sx(hx)} x2={sx(hx)} y1={PAD.t} y2={PAD.t + plotH} />
            {series.filter((s) => s.kind !== "bar" && !s.quiet).map((s) => {
              const p = s.points.find(([x]) => x === hx);
              return p && p[1] != null ? <circle key={s.id} cx={sx(hx)} cy={sy(p[1])} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} /> : null;
            })}
          </g>
        )}
        <rect x={PAD.l} y={PAD.t} width={Math.max(0, width - PAD.l - PAD.r)} height={plotH} fill="transparent" onPointerMove={onMove} onPointerLeave={() => setHover(null)} />
      </svg>
      {hx != null && (
        <div className="tooltip" style={{ left: Math.min(sx(hx) + 12, width - 190), top: 8 }}>
          <div className="small muted" style={{ marginBottom: 4 }}>{fmtX(hx, xKind, tz, true, xUnit)}</div>
          {visible.map((s) => {
            const p = s.points.find(([x]) => x === hx);
            return (
              <div className="tt-row" key={s.id}>
                <span className="row" style={{ gap: 6 }}><i className={s.kind === "bar" ? "" : "line"} style={{ background: s.color }} />{s.label}</span>
                <b>{p && p[1] != null ? fmtY(p[1]) : "—"}</b>
              </div>
            );
          })}
          {band && (() => {
            const b = band.points.find(([x]) => x === hx);
            return b && b[1] != null && b[2] != null ? (
              <div className="tt-row"><span className="muted">{band.label}</span><b>{fmtY(b[1])} – {fmtY(b[2])}</b></div>
            ) : null;
          })()}
        </div>
      )}
    </div>
  );
}

function linePath(points: Pt[], sx: (x: number) => number, sy: (y: number) => number): string {
  let d = "";
  let pen = false;
  for (const [x, y] of [...points].sort((a, b) => a[0] - b[0])) {
    if (y == null) { pen = false; continue; }
    d += `${pen ? "L" : "M"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`;
    pen = true;
  }
  return d;
}

function bandPath(points: Band["points"], sx: (x: number) => number, sy: (y: number) => number): string {
  // Draw contiguous runs only, so gaps in the baseline aren't bridged.
  const runs: Band["points"][] = [];
  let cur: Band["points"] = [];
  for (const p of [...points].sort((a, b) => a[0] - b[0])) {
    if (p[1] == null || p[2] == null) { if (cur.length) runs.push(cur); cur = []; continue; }
    cur.push(p);
  }
  if (cur.length) runs.push(cur);
  return runs
    .map((r) => {
      const top = r.map(([x, , hi]) => `${sx(x).toFixed(1)},${sy(hi!).toFixed(1)}`);
      const bot = [...r].reverse().map(([x, lo]) => `${sx(x).toFixed(1)},${sy(lo!).toFixed(1)}`);
      return `M${top.join("L")}L${bot.join("L")}Z`;
    })
    .join("");
}

/** Bland-Altman: difference vs mean with bias and 95% limits of agreement. */
export function BlandAltmanPlot({ means, diffs, bias, loaLow, loaHigh, unit, height = 260 }: { means: number[]; diffs: number[]; bias: number; loaLow: number; loaHigh: number; unit: string; height?: number }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const xs = means, ys = [...diffs, loaLow, loaHigh, 0];
  const x0 = Math.min(...xs), x1 = Math.max(...xs);
  const yr = Math.max(...ys.map(Math.abs)) * 1.1 || 1;
  const sx = (x: number) => PAD.l + (x1 === x0 ? 0.5 : (x - x0) / (x1 - x0)) * (width - PAD.l - PAD.r);
  const sy = (y: number) => PAD.t + (height - PAD.t - PAD.b) * (1 - (y + yr) / (2 * yr));
  const lines = [
    { y: loaHigh, label: `+LoA ${loaHigh.toFixed(1)}` },
    { y: bias, label: `Bias ${bias.toFixed(1)}` },
    { y: loaLow, label: `−LoA ${loaLow.toFixed(1)}` },
  ];
  const xt = niceTicks(x0, x1, 5), yt = niceTicks(-yr, yr, 4);
  return (
    <div className="chart" ref={ref}>
      <svg width={width} height={height} role="img" aria-label={`Bland-Altman plot: bias ${bias.toFixed(2)} ${unit}, limits ${loaLow.toFixed(2)} to ${loaHigh.toFixed(2)}`}>
        {yt.map((t) => (
          <g key={t}><line className="grid-line" x1={PAD.l} x2={width - PAD.r} y1={sy(t)} y2={sy(t)} /><text className="axis-label" x={PAD.l - 6} y={sy(t) + 4} textAnchor="end">{t}</text></g>
        ))}
        {xt.map((t) => <text key={t} className="axis-label" x={sx(t)} y={height - 6} textAnchor="middle">{t}</text>)}
        {means.map((m, i) => <circle key={i} cx={sx(m)} cy={sy(diffs[i])} r={2.5} fill="var(--s1)" opacity={0.45} />)}
        {lines.map((l, i) => (
          <g key={l.label}>
            <line x1={PAD.l} x2={width - PAD.r} y1={sy(l.y)} y2={sy(l.y)} stroke={i === 1 ? "var(--s2)" : "var(--ink-2)"} strokeWidth={i === 1 ? 2 : 1} strokeDasharray={i === 1 ? undefined : "5 4"} />
            <text className="axis-label" x={width - PAD.r} y={sy(l.y) - 4} textAnchor="end">{l.label}</text>
          </g>
        ))}
      </svg>
      <div className="row between small muted"><span>Mean of devices ({unit})</span><span>Difference test − reference ({unit})</span></div>
    </div>
  );
}

import type { Band } from "@/lib/zones";

/** Ordinal colour for zone i of an n-zone set (validated steps; see globals.css). */
export function zoneColor(i: number, n: number): string {
  return `var(--zc${Math.min(7, Math.max(1, n))}-${i})`;
}

/**
 * 100% stacked bar of time per zone. Sets of six or more zones can't be told
 * apart by lightness alone, so segments wide enough also carry the zone label.
 */
export function ZoneBar({ seconds, bands, large, label }: { seconds: number[]; bands: Band[]; large?: boolean; label: string }) {
  const total = seconds.reduce((a, b) => a + b, 0);
  const n = Math.min(7, bands.length);
  const labelled = bands.length >= 6;
  return (
    <div className={`zbar${large ? " lg" : ""}`} role="img" aria-label={label}>
      {total > 0 && seconds.map((s, i) => {
        if (s <= 0) return null;
        const share = s / total;
        const short = bands[i]?.name.split(" ")[0] ?? `Z${i + 1}`;
        return (
          <span key={i} style={{ width: `${share * 100}%`, background: zoneColor(i, n), color: `var(--zt${n}-${i})` }} title={`${bands[i]?.name}: ${Math.round(share * 100)}% (${Math.round(s / 60)} min)`}>
            {labelled && share >= 0.06 ? short : null}
          </span>
        );
      })}
    </div>
  );
}

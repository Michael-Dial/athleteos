// Training intensity distribution from heart rate, three-zone model
// (Seiler & Kjerland 2006): Z1 below the first threshold, Z2 between the two,
// Z3 above the second.

export interface ZoneBounds {
  /** Highest HR (bpm) counted in Z1. */
  z1Max: number;
  /** Highest HR (bpm) counted in Z2; above it is Z3. */
  z2Max: number;
}

export type ZoneSeconds = [number, number, number];

/**
 * Seconds in each zone from timestamped HR samples. Each sample stands for
 * the time until the next one, capped at `maxGapSec` so a recording gap
 * (strap dropout, pause) is not credited to whatever zone preceded it.
 */
/**
 * Seconds in each band from timestamped samples. `upper` holds ascending
 * band boundaries (n-1 values for n bands); a value equal to a boundary
 * belongs to the lower band. Each sample stands for the time until the next,
 * capped at `maxGapSec` and never past the window end. Samples rejected by
 * `ignore` (stopped, sensor dropout) count toward no band.
 */
export function timeInBands(
  samples: { t: number; v: number }[],
  upper: number[],
  opts: { maxGapSec: number; lastSampleSec: number; window?: { start: number; end: number }; ignore?: (v: number) => boolean },
): number[] {
  const out = new Array(upper.length + 1).fill(0);
  const s = [...samples]
    .filter((x) => Number.isFinite(x.v) && (!opts.window || (x.t >= opts.window.start && x.t < opts.window.end)))
    .sort((a, c) => a.t - c.t);
  for (let i = 0; i < s.length; i++) {
    let dt = i + 1 < s.length ? Math.min(opts.maxGapSec, (s[i + 1].t - s[i].t) / 1000) : Math.min(opts.maxGapSec, opts.lastSampleSec);
    if (opts.window) dt = Math.min(dt, (opts.window.end - s[i].t) / 1000);
    if (dt <= 0 || opts.ignore?.(s[i].v)) continue;
    let band = upper.findIndex((u) => s[i].v <= u);
    if (band === -1) band = upper.length;
    out[band] += dt;
  }
  return out;
}

export function timeInZones(
  samples: { t: number; hr: number }[],
  b: ZoneBounds,
  maxGapSec = 120,
  lastSampleSec = 60,
  /** Recording window; samples outside it are dropped and time is never credited past its end. */
  window?: { start: number; end: number },
): ZoneSeconds {
  const out: ZoneSeconds = [0, 0, 0];
  const s = [...samples]
    .filter((x) => Number.isFinite(x.hr) && x.hr > 0 && (!window || (x.t >= window.start && x.t < window.end)))
    .sort((a, c) => a.t - c.t);
  for (let i = 0; i < s.length; i++) {
    let dt = i + 1 < s.length ? Math.min(maxGapSec, (s[i + 1].t - s[i].t) / 1000) : Math.min(maxGapSec, lastSampleSec);
    if (window) dt = Math.min(dt, (window.end - s[i].t) / 1000);
    if (dt <= 0) continue;
    out[s[i].hr <= b.z1Max ? 0 : s[i].hr <= b.z2Max ? 1 : 2] += dt;
  }
  return out;
}

export type TidPattern = "polarized" | "pyramidal" | "threshold" | "high-intensity" | "insufficient";

/**
 * Pattern label and Polarization-Index (Treff et al. 2019):
 * PI = log10((Z1/Z2) * Z3 * 100) with zones as fractions of total time,
 * defined only when Z1 > Z3 > Z2; PI > 2.00 is polarized. Z2 = 0 is set to
 * 0.01 as in the original paper.
 */
export function classify(z: ZoneSeconds): { pattern: TidPattern; pi: number | null; fractions: ZoneSeconds | null } {
  const total = z[0] + z[1] + z[2];
  if (total <= 0) return { pattern: "insufficient", pi: null, fractions: null };
  const f: ZoneSeconds = [z[0] / total, z[1] / total, z[2] / total];
  let pi: number | null = null;
  if (f[0] > f[2] && f[2] > f[1]) pi = Math.log10((f[0] / Math.max(f[1], 0.01)) * f[2] * 100);
  let pattern: TidPattern;
  if (pi != null && pi > 2) pattern = "polarized";
  else if (f[1] >= f[0] && f[1] >= f[2]) pattern = "threshold";
  else if (f[2] >= f[0] && f[2] >= f[1]) pattern = "high-intensity";
  else pattern = "pyramidal";
  return { pattern, pi, fractions: f };
}

import { mean, sd } from "./basic";

/**
 * Clock time of an instant in the record's own UTC offset, as minutes since
 * the previous local noon (0..1440). Anchoring at noon keeps a night's
 * bedtime and midpoint on one continuous scale across midnight, so a 23:50
 * and a 00:10 bedtime average to midnight rather than noon.
 */
export function minutesFromNoon(instant: string, zoneOffset: string | null): number {
  const m = zoneOffset ? /^([+-])(\d{2}):?(\d{2})$/.exec(zoneOffset) : null;
  const off = m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  const local = new Date(Date.parse(instant) + off * 60000);
  const mins = local.getUTCHours() * 60 + local.getUTCMinutes();
  return (mins - 720 + 1440) % 1440;
}

export function midpointFromNoon(start: string, end: string, zoneOffset: string | null): number {
  const s = minutesFromNoon(start, zoneOffset);
  const dur = (Date.parse(end) - Date.parse(start)) / 60000;
  return s + dur / 2;
}

/**
 * Timing regularity from nightly midpoints: SD of sleep midpoint (minutes).
 * Simple and interpretable, but blind to within-night fragmentation; see
 * Fischer, Klerman & Phillips 2021 for how regularity metrics differ.
 */
export function timingStats(midpoints: number[]): { meanMin: number | null; sdMin: number | null; n: number } {
  return { meanMin: mean(midpoints), sdMin: sd(midpoints), n: midpoints.length };
}

/** Minutes-from-noon back to "HH:MM" local clock time. */
export function clockFromNoon(m: number | null): string | null {
  if (m == null) return null;
  const t = Math.round(m + 720) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
}

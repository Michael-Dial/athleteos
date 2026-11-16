import { mean, sd } from "./basic";
import { addDays, type ISODate } from "../dates";

export interface ZResult {
  value: number | null;
  mean: number | null;
  sd: number | null;
  n: number;
  z: number | null;
}

/**
 * Individual z-score of `date`'s value against the preceding `windowDays`
 * (today excluded, so an outlier can't dampen its own z).
 */
export function zAgainstBaseline(
  byDate: Map<ISODate, number>,
  date: ISODate,
  windowDays: number,
  minN: number,
): ZResult {
  const value = byDate.get(date) ?? null;
  const hist: number[] = [];
  for (let i = 1; i <= windowDays; i++) {
    const v = byDate.get(addDays(date, -i));
    if (v !== undefined) hist.push(v);
  }
  if (hist.length < minN) return { value, mean: null, sd: null, n: hist.length, z: null };
  const m = mean(hist)!;
  const s = sd(hist);
  const z = value != null && s && s > 0 ? (value - m) / s : null;
  return { value, mean: m, sd: s, n: hist.length, z };
}

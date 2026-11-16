import { addDays, type ISODate } from "../dates";

/** Fraction of nights in [start, end] present in `have`, and the longest run of missing nights. */
export function coverage(have: Set<ISODate>, start: ISODate, end: ISODate): { nights: number; total: number; pct: number; longestGap: number; gapEnd: ISODate | null } {
  let total = 0, nights = 0, run = 0, longest = 0;
  let gapEnd: ISODate | null = null;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    total++;
    if (have.has(d)) { nights++; run = 0; continue; }
    run++;
    if (run > longest) { longest = run; gapEnd = d; }
  }
  return { nights, total, pct: total ? (nights / total) * 100 : 0, longestGap: longest, gapEnd };
}

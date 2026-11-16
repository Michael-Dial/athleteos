import { mean, sd } from "./basic";
import { addDays, type ISODate } from "../dates";

export interface HrvDay {
  date: ISODate;
  rmssd: number; // ms, nightly value from one device
}

export interface HrvPoint {
  date: ISODate;
  rmssd: number | null;
  ln: number | null;
  /** Rolling mean of lnRMSSD (Plews et al. 2012). */
  rollingLn: number | null;
  /** exp(rollingLn): geometric mean in ms, for display beside the raw values. */
  rollingMs: number | null;
  /** CV (%) of lnRMSSD across the rolling window. */
  rollingCv: number | null;
  rollingN: number;
  baselineLn: number | null;
  baselineSd: number | null;
  baselineN: number;
  swcLow: number | null;
  swcHigh: number | null;
  status: "below" | "within" | "above" | "insufficient";
}

export interface HrvConfig {
  rollingDays: number;
  baselineDays: number;
  swcSd: number;
  minBaselineN: number;
}

/**
 * Daily HRV status on the log scale. RMSSD is right-skewed, so means, SDs and
 * the smallest worthwhile change are computed on ln(RMSSD) and only
 * back-transformed for display (Plews et al. 2012; Buchheit 2014).
 * Input must come from a single device: devices differ in window and algorithm,
 * so a cross-device baseline would be meaningless.
 */
export function hrvSeries(days: HrvDay[], from: ISODate, to: ISODate, cfg: HrvConfig): HrvPoint[] {
  const byDate = new Map<ISODate, number>();
  for (const d of days) if (d.rmssd > 0 && Number.isFinite(d.rmssd)) byDate.set(d.date, Math.log(d.rmssd));
  // At least 3 values in a 7-day window (Plews et al. 2014 found 3 per week
  // tracks the weekly mean adequately); scale proportionally for other windows.
  const minRolling = Math.max(2, Math.ceil((3 / 7) * cfg.rollingDays));
  const out: HrvPoint[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const ln = byDate.get(d) ?? null;
    const roll: number[] = [];
    for (let i = 0; i < cfg.rollingDays; i++) {
      const v = byDate.get(addDays(d, -i));
      if (v !== undefined) roll.push(v);
    }
    const base: number[] = [];
    for (let i = 0; i < cfg.baselineDays; i++) {
      const v = byDate.get(addDays(d, -i));
      if (v !== undefined) base.push(v);
    }
    const rollingLn = roll.length >= minRolling ? mean(roll) : null;
    const rsd = roll.length >= minRolling ? sd(roll) : null;
    const bMean = base.length >= cfg.minBaselineN ? mean(base) : null;
    const bSd = base.length >= cfg.minBaselineN ? sd(base) : null;
    const swcLow = bMean != null && bSd != null ? bMean - cfg.swcSd * bSd : null;
    const swcHigh = bMean != null && bSd != null ? bMean + cfg.swcSd * bSd : null;
    let status: HrvPoint["status"] = "insufficient";
    if (rollingLn != null && swcLow != null && swcHigh != null) {
      status = rollingLn < swcLow ? "below" : rollingLn > swcHigh ? "above" : "within";
    }
    out.push({
      date: d,
      rmssd: ln != null ? Math.exp(ln) : null,
      ln,
      rollingLn,
      rollingMs: rollingLn != null ? Math.exp(rollingLn) : null,
      rollingCv: rollingLn != null && rsd != null && rollingLn !== 0 ? (rsd / rollingLn) * 100 : null,
      rollingN: roll.length,
      baselineLn: bMean,
      baselineSd: bSd,
      baselineN: base.length,
      swcLow,
      swcHigh,
      status,
    });
  }
  return out;
}

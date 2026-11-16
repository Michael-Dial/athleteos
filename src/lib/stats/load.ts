import { mean, sd, sum } from "./basic";
import { addDays, type ISODate } from "../dates";

/** Session RPE load (Foster et al. 2001): CR-10 RPE x duration (min), in AU. */
export function srpe(rpe: number, durationMin: number): number {
  return rpe * durationMin;
}

/**
 * Banister TRIMP from session-average HR. The per-sample form is more accurate;
 * the average-HR form underestimates load for intermittent sessions, which the
 * UI states wherever TRIMP is shown.
 */
export function banisterTrimp(
  durationMin: number,
  hrAvg: number,
  hrRest: number,
  hrMax: number,
  sex: "male" | "female",
): number | null {
  if (!(durationMin > 0) || !(hrMax > hrRest)) return null;
  const dhr = Math.min(1, Math.max(0, (hrAvg - hrRest) / (hrMax - hrRest)));
  const [a, b] = sex === "female" ? [0.86, 1.67] : [0.64, 1.92];
  return durationMin * dhr * a * Math.exp(b * dhr);
}

export interface AcwrPoint {
  date: ISODate;
  load: number;
  acute: number | null;
  chronic: number | null;
  acwr: number | null;
}

/**
 * Acute:chronic workload ratio. EWMA follows Williams et al. (2017),
 * lambda = 2/(N+1). The rolling variant is uncoupled (chronic window excludes
 * the acute days) per Lolli et al. (2019). Both report null until a full
 * chronic window of history exists, since early ratios are artefacts.
 */
export function acwr(
  daily: Map<ISODate, number>,
  historyStart: ISODate,
  from: ISODate,
  to: ISODate,
  cfg: { acuteDays: number; chronicDays: number; model: "ewma" | "rolling" },
): AcwrPoint[] {
  const out: AcwrPoint[] = [];
  const la = 2 / (cfg.acuteDays + 1);
  const lc = 2 / (cfg.chronicDays + 1);
  let ea = 0, ec = 0, days = 0;
  for (let d = historyStart; d <= to; d = addDays(d, 1)) {
    const load = daily.get(d) ?? 0;
    days++;
    let acute: number | null = null, chronic: number | null = null;
    if (cfg.model === "ewma") {
      ea = load * la + (1 - la) * ea;
      ec = load * lc + (1 - lc) * ec;
      if (days >= cfg.chronicDays) { acute = ea; chronic = ec; }
    } else if (days >= cfg.chronicDays) {
      const a: number[] = [], c: number[] = [];
      for (let i = 0; i < cfg.chronicDays; i++) {
        const v = daily.get(addDays(d, -i)) ?? 0;
        (i < cfg.acuteDays ? a : c).push(v);
      }
      acute = mean(a);
      chronic = mean(c);
    }
    if (d >= from) {
      out.push({ date: d, load, acute, chronic, acwr: acute != null && chronic ? acute / chronic : null });
    }
  }
  return out;
}

/** Foster (1998) weekly monotony (mean/SD of daily load) and strain (weekly load x monotony). */
export function monotonyStrain(daily: Map<ISODate, number>, weekEnd: ISODate): { load: number; monotony: number | null; strain: number | null } {
  const xs: number[] = [];
  for (let i = 0; i < 7; i++) xs.push(daily.get(addDays(weekEnd, -i)) ?? 0);
  const total = sum(xs);
  const s = sd(xs);
  const m = mean(xs)!;
  const monotony = s && s > 0 ? m / s : null;
  return { load: total, monotony, strain: monotony != null ? total * monotony : null };
}

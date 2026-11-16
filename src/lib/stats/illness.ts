import { mean, sd } from "./basic";
import { addDays, type ISODate } from "../dates";

export type SignalKey = "rhr" | "rr" | "temp" | "hrv";

export interface SignalConfig {
  baselineDays: number;
  /** Gap between the night assessed and its baseline, so a developing illness isn't absorbed into its own reference. */
  baselineLagDays: number;
  minBaselineN: number;
  z: number;
  minSignals: number;
}

export interface SignalResult {
  key: SignalKey;
  value: number | null;
  baselineMean: number | null;
  baselineSd: number | null;
  n: number;
  /** Oriented so positive = in the illness direction (RHR, RR, temperature up; HRV down). */
  z: number | null;
  firing: boolean;
}

export interface NightAssessment {
  date: ISODate;
  signals: SignalResult[];
  firing: number;
  assessed: number;
  level: "none" | "watch" | "alert" | "insufficient";
}

const ORIENT: Record<SignalKey, 1 | -1> = { rhr: 1, rr: 1, temp: 1, hrv: -1 };

/**
 * Multi-signal deviation check for one night. Each series must come from one
 * device. HRV is analysed on ln(RMSSD). Level: "watch" when >= minSignals
 * fire, "alert" when that also held the previous night or >= minSignals + 1
 * fire. A heuristic modelled on published wearable studies, not a diagnosis.
 */
export function assessNight(series: Partial<Record<SignalKey, Map<ISODate, number>>>, date: ISODate, cfg: SignalConfig, prevFiring = 0): NightAssessment {
  const signals: SignalResult[] = [];
  for (const key of Object.keys(ORIENT) as SignalKey[]) {
    const ser = series[key];
    if (!ser) continue;
    const tx = (v: number) => (key === "hrv" ? Math.log(v) : v);
    const raw = ser.get(date);
    const hist: number[] = [];
    for (let i = cfg.baselineLagDays + 1; i <= cfg.baselineLagDays + cfg.baselineDays; i++) {
      const v = ser.get(addDays(date, -i));
      if (v != null && (key !== "hrv" || v > 0)) hist.push(tx(v));
    }
    const m = hist.length >= cfg.minBaselineN ? mean(hist) : null;
    const s = hist.length >= cfg.minBaselineN ? sd(hist) : null;
    const z = raw != null && m != null && s && s > 0 && (key !== "hrv" || raw > 0) ? (ORIENT[key] * (tx(raw) - m)) / s : null;
    signals.push({ key, value: raw ?? null, baselineMean: m, baselineSd: s, n: hist.length, z, firing: z != null && z >= cfg.z });
  }
  const assessed = signals.filter((x) => x.z != null).length;
  const firing = signals.filter((x) => x.firing).length;
  let level: NightAssessment["level"] = assessed < cfg.minSignals ? "insufficient" : "none";
  if (firing >= cfg.minSignals) level = firing >= cfg.minSignals + 1 || prevFiring >= cfg.minSignals ? "alert" : "watch";
  return { date, signals, firing, assessed, level };
}

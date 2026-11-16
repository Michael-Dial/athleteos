import "server-only";
import { addDays, type ISODate } from "../dates";
import { zAgainstBaseline, type ZResult } from "../stats/baseline";
import { hrvSeries, type HrvPoint } from "../stats/hrv";
import { acwr, monotonyStrain, type AcwrPoint } from "../stats/load";
import type { AppCtx } from "./context";
import { baselineDevice, getNightly, seriesFor, type NightRow } from "./nightly";
import { listWellness, type WellnessDay } from "./questionnaires";
import { dailyLoad, getTraining, type LoadMethod } from "./training";

export type CompState = "ok" | "watch" | "flag" | "nodata";

interface Base {
  state: CompState;
  /** Oriented so positive = favourable; null when there is no usable data. */
  signed: number | null;
  note: string | null;
}

export interface HrvComp extends Base {
  device: { key: string; name: string; fallback: boolean } | null;
  point: HrvPoint | null;
  series: HrvPoint[];
}
export interface ZComp extends Base {
  device: { key: string; name: string; fallback: boolean } | null;
  z: ZResult | null;
  /** True when today's value is missing and the latest prior night was used. */
  stale: ISODate | null;
}
export interface WellnessComp extends Base {
  z: ZResult | null;
  today: WellnessDay | null;
  lowItems: { key: string; z: number }[];
}
export interface LoadComp extends Base {
  point: AcwrPoint | null;
  series: AcwrPoint[];
  methods: LoadMethod[];
  unrated: number;
  monotony: number | null;
  strain: number | null;
  weekLoad: number;
}

export interface Readiness {
  date: ISODate;
  hrv: HrvComp;
  rhr: ZComp;
  sleep: ZComp;
  wellness: WellnessComp;
  load: LoadComp;
  index: number | null;
  overall: "green" | "amber" | "red" | "unknown";
  nightly: NightRow[];
  errors: string[];
}

function stateFrom(signed: number | null, zFlag: number): CompState {
  if (signed == null) return "nodata";
  if (signed <= -zFlag) return "flag";
  if (signed <= -0.5) return "watch";
  return "ok";
}

/**
 * Transparent, rule-based readiness: each pillar is compared with the
 * athlete's own baseline and expressed as a direction-oriented z. The index is
 * their weighted mean. It is a decision aid built from published conventions,
 * not a validated score, and the UI says so.
 */
export async function getReadiness(ctx: AppCtx, date: ISODate, opts: { historyDays?: number } = {}): Promise<Readiness> {
  const s = ctx.settings;
  const historyDays = opts.historyDays ?? 42;
  const nightStart = addDays(date, -(Math.max(s.hrv.baselineDays, s.baselines.windowDays) + s.hrv.rollingDays + historyDays));
  const loadHistoryStart = addDays(date, -(s.load.chronicDays * 3 + historyDays));
  const [nightly, training, wellness] = await Promise.all([
    getNightly(ctx, nightStart, date),
    getTraining(ctx, loadHistoryStart, date),
    listWellness(ctx.athlete.id, addDays(date, -(s.baselines.windowDays + 1)), date),
  ]);
  const errors = [nightly.owError, training.owError].filter((e): e is string => !!e);
  const rows = nightly.rows;
  const lookback = addDays(date, -3);

  // HRV: single device, ln scale.
  const hDev = baselineDevice(ctx, rows, "hrv", date, lookback);
  let hrv: HrvComp = { state: "nodata", signed: null, note: null, device: hDev, point: null, series: [] };
  if (hDev) {
    const series = hrvSeries(
      [...seriesFor(rows, hDev.key, "hrv")].map(([d, v]) => ({ date: d, rmssd: v })),
      addDays(date, -historyDays + 1), date, s.hrv,
    );
    const point = series.at(-1) ?? null;
    let signed: number | null = null;
    let note: string | null = null;
    if (point && point.status !== "insufficient" && point.baselineSd) {
      const z = (point.rollingLn! - point.baselineLn!) / point.baselineSd;
      if (point.status === "below") signed = Math.min(z, -0.5);
      else signed = 0;
      if (point.status === "above") note = "Above the normal range: often benign, but a sustained rise can accompany parasympathetic saturation in heavy training.";
    } else if (point) {
      note = `Building baseline: ${point.baselineN}/${s.hrv.minBaselineN} nights from this device.`;
    }
    hrv = { state: stateFrom(signed, s.baselines.zFlag), signed, note, device: hDev, point, series };
  }

  const zComp = (metric: "rhr" | "sleep", orient: 1 | -1): ZComp => {
    const dev = baselineDevice(ctx, rows, metric, date, lookback);
    if (!dev) return { state: "nodata", signed: null, note: null, device: null, z: null, stale: null };
    const ser = seriesFor(rows, dev.key, metric);
    let at = date;
    // Fall back to the latest night within 3 days rather than showing nothing.
    while (!ser.has(at) && at > lookback) at = addDays(at, -1);
    const z = zAgainstBaseline(ser, at, s.baselines.windowDays, s.baselines.minN);
    const signed = z.z != null ? orient * z.z : null;
    const note = z.z == null ? `Building baseline: ${z.n}/${s.baselines.minN} nights from this device.` : null;
    return { state: stateFrom(signed, s.baselines.zFlag), signed, note, device: dev, z, stale: at !== date && ser.has(at) ? at : null };
  };
  const rhr = zComp("rhr", -1);
  const sleep = zComp("sleep", 1);
  if (sleep.z?.value != null && sleep.z.value < s.readiness.sleepTargetMin) {
    const short = Math.round(s.readiness.sleepTargetMin - sleep.z.value);
    sleep.note = `${short} min short of the ${Math.round(s.readiness.sleepTargetMin / 60 * 10) / 10} h target.`;
    if (sleep.state === "ok") sleep.state = "watch";
  }

  // Wellness composite and items.
  const wMap = new Map(wellness.map((w) => [w.date, w.composite]));
  const wz = zAgainstBaseline(wMap, date, s.baselines.windowDays, s.baselines.minN);
  const today = wellness.find((w) => w.date === date) ?? null;
  const lowItems: { key: string; z: number }[] = [];
  if (today) {
    for (const key of Object.keys(today.item_scores)) {
      const m = new Map(wellness.filter((w) => key in w.item_scores).map((w) => [w.date, w.item_scores[key]]));
      const iz = zAgainstBaseline(m, date, s.baselines.windowDays, s.baselines.minN);
      if (iz.z != null && iz.z <= -s.baselines.zFlag) lowItems.push({ key, z: iz.z });
    }
  }
  const wSigned = wz.z;
  const wellnessComp: WellnessComp = {
    state: today ? stateFrom(wSigned, s.baselines.zFlag) : "nodata",
    signed: today ? wSigned : null,
    note: !today ? "No wellness response today." : wz.z == null ? `Building baseline: ${wz.n}/${s.baselines.minN} days.` : null,
    z: wz, today, lowItems,
  };
  if (wellnessComp.state === "ok" && lowItems.length) wellnessComp.state = "watch";

  // Load: ACWR on the configured unit.
  const { byDate, methods, unrated } = dailyLoad(training.sessions, addDays(date, -s.load.chronicDays + 1));
  const series = acwr(byDate, loadHistoryStart, addDays(date, -historyDays + 1), date, {
    acuteDays: s.load.acuteDays, chronicDays: s.load.chronicDays, model: s.load.acwrModel,
  });
  const lp = series.at(-1) ?? null;
  let lSigned: number | null = null;
  if (lp?.acwr != null) {
    lSigned = lp.acwr > s.readiness.acwrHigh ? -Math.min(3, 1 + (lp.acwr - s.readiness.acwrHigh) * 5) : 0;
  }
  const ms = monotonyStrain(byDate, date);
  const loadNotes: string[] = [];
  if (methods.size > 1) loadNotes.push("Mixes load units (sRPE and TRIMP); the ratio is only indicative.");
  if (unrated) loadNotes.push(`${unrated} session${unrated === 1 ? "" : "s"} in the last ${s.load.chronicDays} days ${unrated === 1 ? "has" : "have"} no load (${s.load.method === "srpe" ? "no RPE" : "no HR"}).`);
  if (lp && lp.acute == null) loadNotes.push(`Needs ${s.load.chronicDays} days of history.`);
  else if (lp && !lp.chronic) loadNotes.push(`No rated load in the last ${s.load.chronicDays} days, so there is no ratio yet.`);
  const load: LoadComp = {
    state: stateFrom(lSigned, s.baselines.zFlag), signed: lSigned, note: loadNotes.join(" ") || null,
    point: lp, series, methods: [...methods], unrated, monotony: ms.monotony, strain: ms.strain, weekLoad: ms.load,
  };

  const w = s.readiness.weights;
  const parts: [number | null, number][] = [
    [hrv.signed, w.hrv], [rhr.signed, w.rhr], [sleep.signed, w.sleep], [wellnessComp.signed, w.wellness], [load.signed, w.load],
  ];
  const used = parts.filter(([v, wt]) => v != null && wt > 0) as [number, number][];
  const totalW = used.reduce((a, [, wt]) => a + wt, 0);
  const index = used.length >= 2 && totalW > 0 ? used.reduce((a, [v, wt]) => a + Math.max(-3, Math.min(3, v)) * wt, 0) / totalW : null;
  const anyFlag = [hrv, rhr, sleep, wellnessComp, load].some((c) => c.state === "flag");
  const overall: Readiness["overall"] =
    index == null ? "unknown" : index <= -s.baselines.zFlag ? "red" : anyFlag || index <= -0.5 ? "amber" : "green";

  return { date, hrv, rhr, sleep, wellness: wellnessComp, load, index, overall, nightly: rows, errors };
}

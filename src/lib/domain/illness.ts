import "server-only";
import { addDays, localDateWithOffset, todayIn, type ISODate } from "../dates";
import { getTimeseries } from "../ow/api";
import { assessNight, type NightAssessment, type SignalKey } from "../stats/illness";
import { deviceKey, deviceName } from "../stats/sources";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";
import { baselineDevice, FALLBACK_WINDOW_DAYS, getNightly, seriesFor } from "./nightly";
import { listDefs, listResponses } from "./questionnaires";

export interface IllnessReport {
  date: ISODate;
  devices: Record<SignalKey, { key: string; name: string; fallback: boolean } | null>;
  nights: NightAssessment[];
  latest: NightAssessment | null;
  selfReported: ISODate[];
  owErrors: string[];
}

/**
 * Nightly multi-signal deviation check over `days` nights ending at `date`.
 * Signals: resting HR up, respiratory rate up, skin-temperature deviation up,
 * ln(RMSSD) down; each from a single device against its own lagged baseline.
 */
export async function getIllness(ctx: AppCtx, dateIn?: ISODate, days = 21): Promise<IllnessReport> {
  const s = ctx.settings;
  const c = s.illness;
  const date = dateIn ?? todayIn(s.timezone);
  const histStart = addDays(date, -Math.max(days + c.baselineLagDays + c.baselineDays + 1, FALLBACK_WINDOW_DAYS));
  const errors: string[] = [];
  const [nightly, temp, defs] = await Promise.all([
    getNightly(ctx, histStart, date),
    ctx.ow
      ? getTimeseries(ctx.ow, { start: histStart, end: date, types: ["skin_temperature_deviation"], resolution: "1day", sourceSelection: "all" })
          .catch((e) => { errors.push(errorMessage(e)); return []; })
      : Promise.resolve([]),
    listDefs(ctx.athlete.id, true),
  ]);
  if (nightly.owError) errors.push(nightly.owError);
  const rows = nightly.rows;
  const look = addDays(date, -3);
  const dev = {
    rhr: baselineDevice(ctx, rows, "rhr", date, look),
    rr: baselineDevice(ctx, rows, "respiratory_rate", date, look),
    hrv: baselineDevice(ctx, rows, "hrv", date, look),
    temp: null as { key: string; name: string; fallback: boolean } | null,
  };

  // Temperature deviation: the RHR device if it reports one, else the source with most days.
  const tempBy = new Map<string, { name: string; m: Map<ISODate, number> }>();
  for (const r of temp) {
    const k = deviceKey(r.source);
    const e = tempBy.get(k) ?? { name: deviceName(r.source), m: new Map() };
    e.m.set(localDateWithOffset(r.timestamp, r.zone_offset, s.timezone), r.value);
    tempBy.set(k, e);
  }
  const tk = dev.rhr && tempBy.has(dev.rhr.key) ? dev.rhr.key : [...tempBy.entries()].sort((a, b) => b[1].m.size - a[1].m.size)[0]?.[0];
  if (tk) dev.temp = { key: tk, name: tempBy.get(tk)!.name, fallback: !(dev.rhr && tk === dev.rhr.key) };

  const series: Partial<Record<SignalKey, Map<ISODate, number>>> = {
    ...(dev.rhr ? { rhr: seriesFor(rows, dev.rhr.key, "rhr") } : {}),
    ...(dev.rr ? { rr: seriesFor(rows, dev.rr.key, "respiratory_rate") } : {}),
    ...(dev.hrv ? { hrv: seriesFor(rows, dev.hrv.key, "hrv") } : {}),
    ...(tk ? { temp: tempBy.get(tk)!.m } : {}),
  };
  const cfg = { baselineDays: c.baselineDays, baselineLagDays: c.baselineLagDays, minBaselineN: c.minBaselineN, z: c.z, minSignals: c.minSignals };
  const nights: NightAssessment[] = [];
  let prev = 0;
  for (let d = addDays(date, -(days - 1)); d <= date; d = addDays(d, 1)) {
    const a = assessNight(series, d, cfg, prev);
    nights.push(a);
    prev = a.firing;
  }

  const selfReported: ISODate[] = [];
  for (const d of defs) {
    if (!d.items.some((i) => i.key === "illness")) continue;
    for (const r of await listResponses(ctx.athlete.id, d.id, addDays(date, -(days - 1)), date)) if (r.answers.illness === true) selfReported.push(r.date);
  }

  // Latest night with any assessment (today's may not have synced yet).
  const latest = [...nights].reverse().find((n) => n.assessed > 0) ?? null;
  return { date, devices: dev, nights, latest, selfReported, owErrors: [...new Set(errors)] };
}

import "server-only";
import { addDays, startOfWeek, todayIn, type ISODate } from "../dates";
import { finite, mean, sd } from "../stats/basic";
import { getTimeseries } from "../ow/api";
import { deviceKey, deviceName } from "../stats/sources";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";
import { coverageOrder, getNightly, METRIC_VALUE, type NightRow } from "./nightly";
import { listDefs, listResponses } from "./questionnaires";
import { dailyLoad, getTraining } from "./training";

export interface DeviceSeries {
  device: { key: string; name: string };
  points: { weekStart: ISODate; value: number; n: number; cvPct?: number | null }[];
}

export interface TrendsReport {
  weeks: ISODate[];
  load: { weekStart: ISODate; load: number; durationMin: number; sessions: number; unrated: number }[];
  loadMethods: string[];
  hrv: DeviceSeries[];
  rhr: DeviceSeries[];
  sleep: DeviceSeries[];
  bodyMass: DeviceSeries[];
  vo2max: DeviceSeries[];
  owErrors: string[];
}

const MAX_DEVICES = 4;

function weekly(rows: NightRow[], metric: "hrv" | "rhr" | "sleep", weeks: ISODate[]): DeviceSeries[] {
  const get = METRIC_VALUE[metric];
  return coverageOrder(rows, metric).slice(0, MAX_DEVICES).map((k) => {
    const mine = rows.filter((r) => r.key === k);
    return {
      device: { key: k, name: mine[0].name },
      points: weeks.flatMap((w) => {
        const v = finite(mine.filter((r) => r.date >= w && r.date <= addDays(w, 6)).map(get));
        if (!v.length) return [];
        if (metric === "hrv") {
          // Weekly HRV on the log scale, back-transformed for the axis; CV on ln.
          const ln = v.filter((x) => x > 0).map(Math.log);
          const m = mean(ln)!, s = sd(ln);
          return [{ weekStart: w, value: Math.exp(m), n: ln.length, cvPct: s != null && m ? (s / m) * 100 : null }];
        }
        return [{ weekStart: w, value: mean(v)!, n: v.length }];
      }),
    };
  }).filter((s) => s.points.length);
}

async function seriesByDevice(ctx: AppCtx, type: string, start: ISODate, end: ISODate, weeks: ISODate[], pick: "mean" | "last"): Promise<DeviceSeries[]> {
  const rows = await getTimeseries(ctx.ow!, { start, end, types: [type], resolution: "1day", sourceSelection: "all" });
  const byDev = new Map<string, { name: string; pts: { d: string; v: number }[] }>();
  for (const r of rows) {
    const k = deviceKey(r.source);
    const e = byDev.get(k) ?? { name: deviceName(r.source), pts: [] };
    e.pts.push({ d: r.timestamp.slice(0, 10), v: r.value });
    byDev.set(k, e);
  }
  return [...byDev.entries()].sort((a, b) => b[1].pts.length - a[1].pts.length).slice(0, MAX_DEVICES).map(([k, e]) => ({
    device: { key: k, name: e.name },
    points: weeks.flatMap((w) => {
      const v = e.pts.filter((p) => p.d >= w && p.d <= addDays(w, 6)).sort((a, b) => a.d.localeCompare(b.d)).map((p) => p.v);
      if (!v.length) return [];
      return [{ weekStart: w, value: pick === "last" ? v.at(-1)! : mean(v)!, n: v.length }];
    }),
  }));
}

/** Weekly trends over months. Each overnight metric is kept per device so a device change never looks like a physiological shift. */
export async function getTrends(ctx: AppCtx, nWeeks: number): Promise<TrendsReport> {
  const s = ctx.settings;
  const today = todayIn(s.timezone);
  const first = addDays(startOfWeek(today), -7 * (nWeeks - 1));
  const weeks: ISODate[] = Array.from({ length: nWeeks }, (_, i) => addDays(first, 7 * i));
  const errors: string[] = [];
  const safe = <T,>(p: Promise<T>, empty: T) => p.catch((e) => { errors.push(errorMessage(e)); return empty; });

  const [nightly, training, mass, vo2, defs] = await Promise.all([
    getNightly(ctx, first, today),
    getTraining(ctx, first, today),
    ctx.ow ? safe(seriesByDevice(ctx, "weight", first, today, weeks, "mean"), []) : Promise.resolve([]),
    ctx.ow ? safe(seriesByDevice(ctx, "vo2_max", first, today, weeks, "last"), []) : Promise.resolve([]),
    listDefs(ctx.athlete.id, true),
  ]);
  if (nightly.owError) errors.push(nightly.owError);
  if (training.owError) errors.push(training.owError);

  const { methods } = dailyLoad(training.sessions);
  const load = weeks.map((w) => {
    const xs = training.sessions.filter((x) => !x.excluded && x.date >= w && x.date <= addDays(w, 6));
    return { weekStart: w, load: xs.reduce((a, x) => a + (x.load ?? 0), 0), durationMin: xs.reduce((a, x) => a + (x.durationMin ?? 0), 0), sessions: xs.length, unrated: xs.filter((x) => x.load == null).length };
  });

  // Self-reported body mass from any questionnaire item keyed body_mass/weight.
  const self: { d: string; v: number }[] = [];
  for (const d of defs) {
    const k = d.items.find((i) => i.key === "body_mass" || i.key === "weight")?.key;
    if (!k) continue;
    for (const r of await listResponses(ctx.athlete.id, d.id, first, today)) {
      const v = r.answers[k];
      if (typeof v === "number") self.push({ d: r.date, v });
    }
  }
  const bodyMass = self.length
    ? [{ device: { key: "self", name: "Self-reported" }, points: weeks.flatMap((w) => { const v = self.filter((p) => p.d >= w && p.d <= addDays(w, 6)).map((p) => p.v); return v.length ? [{ weekStart: w, value: mean(v)!, n: v.length }] : []; }) }, ...mass]
    : mass;

  return {
    weeks, load, loadMethods: [...methods],
    hrv: weekly(nightly.rows, "hrv", weeks),
    rhr: weekly(nightly.rows, "rhr", weeks),
    sleep: weekly(nightly.rows, "sleep", weeks),
    bodyMass, vo2max: vo2,
    owErrors: [...new Set(errors)],
  };
}

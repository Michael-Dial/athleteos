import "server-only";
import { addDays, todayIn, type ISODate } from "../dates";
import { coverage } from "../stats/coverage";
import { owJson } from "../ow/client";
import { getConnections } from "../ow/api";
import type { AppCtx } from "./context";
import { errorMessage } from "./errors";
import { baselineDevice, coverageOrder, FALLBACK_WINDOW_DAYS, getNightly, METRIC_VALUE } from "./nightly";
import { listDefs, listResponses } from "./questionnaires";
import { getTraining } from "./training";

export interface CoverageReport {
  start: ISODate;
  end: ISODate;
  dates: ISODate[];
  devices: {
    key: string; name: string; nights: number; hrvNights: number; pct: number; longestGap: number; lastNight: ISODate | null;
    /** One character per date: "2" sleep + HRV, "1" sleep or other overnight data only, "0" nothing. */
    cells: string;
  }[];
  baselines: { metric: string; device: { key: string; name: string; fallback: boolean } | null; pct: number | null; longestGap: number | null; lastNight: ISODate | null }[];
  ow: { reachable: boolean; latencyMs: number | null; error: string | null };
  connections: { provider: string; account: string; status: string; lastSyncedAt: string | null; hoursSinceSync: number | null; stale: boolean }[];
  questionnaires: { slug: string; name: string; answered: number; days: number; pct: number; missing: ISODate[] }[];
  unratedSessions: number;
  owErrors: string[];
}

export async function getCoverage(ctx: AppCtx, days: number): Promise<CoverageReport> {
  const s = ctx.settings;
  const end = todayIn(s.timezone);
  const start = addDays(end, -(days - 1));
  const dates: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dates.push(d);

  // Reachability is timed on an uncached call so it reflects the backend now.
  const pingT0 = Date.now();
  const ping = ctx.owConfigured
    ? owJson("/oauth/providers").then(() => ({ reachable: true, latencyMs: Date.now() - pingT0, error: null }), (e) => ({ reachable: false, latencyMs: null, error: errorMessage(e) }))
    : Promise.resolve({ reachable: false, latencyMs: null, error: "Device data isn't set up yet." });
  const adStart = addDays(end, -(s.coverage.adherenceDays - 1));
  const [nightly, conns, training, defs, ow] = await Promise.all([
    // Never fewer nights than the device-fallback window, so baselines match other pages.
    getNightly(ctx, [start, addDays(end, -(FALLBACK_WINDOW_DAYS - 1))].sort()[0], end),
    ctx.ow ? getConnections(ctx.ow).then((v) => ({ v, e: null as string | null }), (e) => ({ v: [], e: errorMessage(e) })) : Promise.resolve({ v: [], e: null }),
    getTraining(ctx, adStart, end),
    listDefs(ctx.athlete.id),
    ping,
  ]);
  const allRows = nightly.rows;
  const rows = allRows.filter((r) => r.date >= start);

  const byDev = new Map<string, { name: string; any: Set<ISODate>; hrv: Set<ISODate> }>();
  for (const r of rows) {
    const hasAny = r.sleepMin != null || r.hrv != null || r.rhr != null || r.rr != null || r.spo2 != null;
    if (!hasAny) continue;
    const d = byDev.get(r.key) ?? { name: r.name, any: new Set(), hrv: new Set() };
    d.any.add(r.date);
    if (r.hrv != null) d.hrv.add(r.date);
    byDev.set(r.key, d);
  }
  const devices = [...byDev.entries()].map(([key, d]) => {
    const c = coverage(d.any, start, end);
    const sorted = [...d.any].sort();
    return {
      key, name: d.name, nights: c.nights, hrvNights: d.hrv.size, pct: c.pct, longestGap: c.longestGap, lastNight: sorted.at(-1) ?? null,
      cells: dates.map((x) => (d.hrv.has(x) ? "2" : d.any.has(x) ? "1" : "0")).join(""),
    };
  }).sort((a, b) => b.nights - a.nights);

  const baselines = (["hrv", "rhr", "sleep", "respiratory_rate"] as const).map((metric) => {
    const dev = baselineDevice(ctx, allRows, metric, end, addDays(end, -3)) ?? (() => {
      const k = coverageOrder(allRows, metric, end)[0];
      return k ? { key: k, name: allRows.find((r) => r.key === k)!.name, fallback: true } : null;
    })();
    if (!dev) return { metric, device: null, pct: null, longestGap: null, lastNight: null };
    const have = new Set(rows.filter((r) => r.key === dev.key && METRIC_VALUE[metric](r) != null).map((r) => r.date));
    const c = coverage(have, start, end);
    return { metric, device: dev, pct: c.pct, longestGap: c.longestGap, lastNight: [...have].sort().at(-1) ?? null };
  });

  const now = Date.now();
  const connections = conns.v.map((c) => {
    const hours = c.last_synced_at ? (now - Date.parse(c.last_synced_at)) / 3600000 : null;
    return {
      provider: c.provider, account: c.display_label, status: c.status, lastSyncedAt: c.last_synced_at, hoursSinceSync: hours,
      stale: c.status === "active" && (hours == null || hours > s.coverage.staleHours),
    };
  }).sort((a, b) => Number(b.stale) - Number(a.stale) || (b.hoursSinceSync ?? 1e9) - (a.hoursSinceSync ?? 1e9));

  const questionnaires = [];
  for (const d of defs.filter((x) => x.schedule === "daily")) {
    const answered = new Set((await listResponses(ctx.athlete.id, d.id, adStart, end)).map((r) => r.date));
    const missing: ISODate[] = [];
    for (let x = adStart; x <= end; x = addDays(x, 1)) if (!answered.has(x)) missing.push(x);
    questionnaires.push({ slug: d.slug, name: d.name, answered: answered.size, days: s.coverage.adherenceDays, pct: (answered.size / s.coverage.adherenceDays) * 100, missing: missing.slice(-14) });
  }

  return {
    start, end, dates, devices, baselines, ow, connections, questionnaires,
    unratedSessions: training.sessions.filter((x) => !x.excluded && x.load == null).length,
    owErrors: [nightly.owError, conns.e, training.owError].filter((e): e is string => !!e),
  };
}

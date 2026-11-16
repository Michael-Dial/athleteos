import "server-only";
import { addDays, todayIn } from "../dates";
import { getTimeseries } from "../ow/api";
import { deviceName } from "../stats/sources";
import type { AppCtx } from "./context";
import type { TrainingSession } from "./training";

export type SeriesKind = "heart_rate" | "speed" | "power" | "running_power";
const KINDS: SeriesKind[] = ["heart_rate", "speed", "power", "running_power"];
const MAX_RECORDINGS = 3;

export interface SessionSeries {
  /** 1-minute samples per kind, each from a single recording. */
  samples: Partial<Record<SeriesKind, { t: number; v: number }[]>>;
  /** Device that supplied each kind. */
  device: Partial<Record<SeriesKind, string>>;
  window: { start: number; end: number } | null;
}

/**
 * The session's 1-minute HR, speed and power. Recordings are tried in the
 * athlete's workout device priority (primary first) and each kind is taken
 * whole from the first recording that has it, never mixed across devices.
 * At most three recordings are fetched per session, all four kinds in one
 * request each; settled sessions use the long cache.
 */
export async function sessionSeries(ctx: AppCtx, s: TrainingSession, want: SeriesKind[] = KINDS): Promise<SessionSeries> {
  const out: SessionSeries = { samples: {}, device: {}, window: null };
  if (!ctx.ow || !s.primary) return out;
  out.window = { start: Date.parse(s.primary.start_time) - 60_000, end: Date.parse(s.primary.end_time) };
  const settled = s.date < addDays(todayIn(ctx.settings.timezone), -7);
  const missing = new Set(want);
  for (const rec of s.recordings.slice(0, MAX_RECORDINGS)) {
    if (!missing.size) break;
    const dsid = rec.source.data_source_id;
    if (!dsid) continue;
    const rows = await getTimeseries(ctx.ow, {
      start: rec.start_time, end: rec.end_time, types: KINDS, resolution: "1min",
      dataSourceId: dsid, sourceSelection: "all", includeRedundantRelays: true,
      ttl: settled ? Math.max(ctx.ow.ttl, ctx.ow.historicalTtl) : undefined,
    });
    for (const k of [...missing]) {
      const pts = rows.filter((r) => r.type === k).map((r) => ({ t: Date.parse(r.timestamp), v: r.value }));
      if (pts.length) {
        out.samples[k] = pts;
        out.device[k] = deviceName(rec.source);
        missing.delete(k);
      }
    }
  }
  return out;
}

import "server-only";
import { getTimeseries } from "../ow/api";
import { agreement, bin, pairUp, searchLag, type Agreement, type Sample } from "../stats/agreement";
import type { AppCtx } from "./context";

export interface CompareInput {
  type: string;
  test: string; // data_source_id
  reference: string; // data_source_id
  startIso: string;
  endIso: string;
  bound: number | null;
}

export interface CompareResult {
  nTest: number;
  nRef: number;
  lag: { lagSec: number; r: number | null; n: number; scanned: { lagSec: number; r: number | null }[]; atEdge: boolean };
  stats: Agreement | null;
  overlay: { t: number; test: number | null; ref: number | null }[];
  ba: { mean: number; diff: number }[];
  unit: string;
  epochSec: number;
}

/**
 * Agreement between two data sources for one series. Each source is fetched
 * raw on its own (relay copies included, since source comparison is the
 * point), the clock lag is searched within the configured tolerance, then the
 * lag-corrected epoch means are compared.
 */
export async function compareSources(ctx: AppCtx, inp: CompareInput): Promise<CompareResult> {
  const c = ctx.settings.compare;
  const fetchOne = (dsid: string) =>
    getTimeseries(ctx.ow!, { start: inp.startIso, end: inp.endIso, types: [inp.type], resolution: "raw", dataSourceId: dsid, sourceSelection: "all", includeRedundantRelays: true });
  const [ta, tb] = await Promise.all([fetchOne(inp.test), fetchOne(inp.reference)]);
  const toSamples = (rows: typeof ta): Sample[] => rows.map((r) => ({ t: Date.parse(r.timestamp), v: r.value })).filter((s) => Number.isFinite(s.t) && Number.isFinite(s.v));
  const a = toSamples(ta);
  const b = toSamples(tb);
  const epochMs = c.epochSeconds * 1000;
  const lag = searchLag(a, b, epochMs, c.lagToleranceSeconds * 1000, c.lagStepSeconds * 1000, c.minPairs);
  const binA = bin(a, epochMs);
  const binB = bin(b, epochMs, lag.lagMs);
  const p = pairUp(binA, binB);
  const stats = p.x.length >= c.minPairs ? agreement(p.x, p.y, inp.bound ?? undefined) : null;

  const keys = [...new Set([...binA.keys(), ...binB.keys()])].sort((x, y) => x - y);
  const step = Math.max(1, Math.ceil(keys.length / 1500));
  const overlay = keys.filter((_, i) => i % step === 0).map((t) => ({ t, test: binA.get(t) ?? null, ref: binB.get(t) ?? null }));
  const baStep = Math.max(1, Math.ceil(p.x.length / 2000));
  const ba: CompareResult["ba"] = [];
  for (let i = 0; i < p.x.length; i += baStep) ba.push({ mean: (p.x[i] + p.y[i]) / 2, diff: p.x[i] - p.y[i] });

  const tolMs = c.lagToleranceSeconds * 1000;
  return {
    nTest: a.length,
    nRef: b.length,
    lag: {
      lagSec: lag.lagMs / 1000, r: lag.r, n: lag.n,
      scanned: lag.scanned.map((s) => ({ lagSec: s.lagMs / 1000, r: s.r })),
      // A best lag on the search boundary means the true offset may lie beyond it.
      atEdge: lag.r != null && tolMs > 0 && Math.abs(lag.lagMs) >= tolMs - c.lagStepSeconds * 1000 / 2,
    },
    stats, overlay, ba,
    unit: ta[0]?.unit ?? tb[0]?.unit ?? "",
    epochSec: c.epochSeconds,
  };
}

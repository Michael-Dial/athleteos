import { mean, pearson, sd, tCdf, tCrit } from "./basic";

export interface Sample {
  t: number; // epoch ms
  v: number;
}

/** Mean of samples per epoch bin; key = bin start (ms). `shiftMs` is subtracted from timestamps first. */
export function bin(samples: Sample[], epochMs: number, shiftMs = 0): Map<number, number> {
  const acc = new Map<number, { s: number; n: number }>();
  for (const { t, v } of samples) {
    if (!Number.isFinite(v)) continue;
    const k = Math.floor((t - shiftMs) / epochMs) * epochMs;
    const e = acc.get(k);
    if (e) { e.s += v; e.n++; } else acc.set(k, { s: v, n: 1 });
  }
  const out = new Map<number, number>();
  for (const [k, e] of acc) out.set(k, e.s / e.n);
  return out;
}

export function pairUp(a: Map<number, number>, b: Map<number, number>): { t: number[]; x: number[]; y: number[] } {
  const t: number[] = [], x: number[] = [], y: number[] = [];
  const keys = [...a.keys()].sort((p, q) => p - q);
  for (const k of keys) {
    const vb = b.get(k);
    if (vb !== undefined) { t.push(k); x.push(a.get(k)!); y.push(vb); }
  }
  return { t, x, y };
}

export interface LagResult {
  lagMs: number;
  r: number | null;
  n: number;
  scanned: { lagMs: number; r: number | null; n: number }[];
}

/**
 * Search the clock lag between two devices. OW keeps each device's own
 * timestamps with no cross-device offset, so b is shifted by each candidate lag
 * within +/- tolerance and the lag maximising Pearson r is kept. r (not MAE) is
 * the objective because it is blind to constant bias, which is what the
 * agreement statistics must then measure, not absorb.
 */
export function searchLag(a: Sample[], b: Sample[], epochMs: number, toleranceMs: number, stepMs: number, minPairs: number): LagResult {
  const binnedA = bin(a, epochMs);
  const scanned: LagResult["scanned"] = [];
  let best: { lagMs: number; r: number | null; n: number } = { lagMs: 0, r: null, n: 0 };
  const step = Math.max(1, stepMs);
  for (let lag = -toleranceMs; lag <= toleranceMs; lag += step) {
    const p = pairUp(binnedA, bin(b, epochMs, lag));
    const r = p.x.length >= minPairs ? pearson(p.x, p.y) : null;
    scanned.push({ lagMs: lag, r, n: p.x.length });
    if (r == null) continue;
    const better = best.r == null || r > best.r + 1e-12 || (Math.abs(r - best.r) <= 1e-12 && Math.abs(lag) < Math.abs(best.lagMs));
    if (better) best = { lagMs: lag, r, n: p.x.length };
  }
  return { ...best, scanned };
}

export interface Agreement {
  n: number;
  /** Effective n after lag-1 autocorrelation of the differences. */
  nEff: number;
  rho1: number | null;
  bias: number;
  sdDiff: number;
  loaLow: number;
  loaHigh: number;
  biasCi: [number, number];
  loaLowCi: [number, number];
  loaHighCi: [number, number];
  /** Slope of difference on mean: non-zero suggests proportional bias. */
  propSlope: number | null;
  ccc: number | null;
  pearsonR: number | null;
  mae: number;
  rmse: number;
  mape: number | null;
  tost: { bound: number; p: number; equivalent: boolean } | null;
}

/**
 * Agreement of test (x) against reference (y), differences as x - y.
 * Bland-Altman 95% LoA with approximate CIs (Bland & Altman 1999), Lin's CCC
 * (1989), MAE/RMSE/MAPE, and paired TOST on the bias when a bound is given.
 * Epoch samples from one person are autocorrelated, so CIs and TOST use an
 * effective n = n(1-rho1)/(1+rho1) rather than the raw pair count.
 */
export function agreement(x: number[], y: number[], equivalenceBound?: number): Agreement | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const d: number[] = [], m: number[] = [];
  for (let i = 0; i < n; i++) { d.push(x[i] - y[i]); m.push((x[i] + y[i]) / 2); }
  const bias = mean(d)!;
  const sdDiff = sd(d)!;
  const loaLow = bias - 1.96 * sdDiff;
  const loaHigh = bias + 1.96 * sdDiff;

  let rho1: number | null = null;
  if (n > 3 && sdDiff > 0) {
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      den += (d[i] - bias) ** 2;
      if (i > 0) num += (d[i] - bias) * (d[i - 1] - bias);
    }
    rho1 = den > 0 ? num / den : null;
  }
  const r1 = rho1 != null ? Math.max(0, Math.min(0.99, rho1)) : 0;
  const nEff = Math.max(3, (n * (1 - r1)) / (1 + r1));
  const df = nEff - 1;
  const tc = tCrit(0.95, df);
  const seBias = sdDiff / Math.sqrt(nEff);
  const seLoa = Math.sqrt((3 * sdDiff * sdDiff) / nEff);

  const mx = mean(x.slice(0, n))!, my = mean(y.slice(0, n))!;
  let sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; sxy += (x[i] - mx) * (y[i] - my); }
  sxx /= n; syy /= n; sxy /= n;
  const cccDen = sxx + syy + (mx - my) ** 2;
  const ccc = cccDen > 0 ? (2 * sxy) / cccDen : null;

  const mm = mean(m)!;
  let smd = 0, smm = 0;
  for (let i = 0; i < n; i++) { smd += (m[i] - mm) * (d[i] - bias); smm += (m[i] - mm) ** 2; }
  const propSlope = smm > 0 ? smd / smm : null;

  let ae = 0, se = 0, ape = 0, apeN = 0;
  for (let i = 0; i < n; i++) {
    ae += Math.abs(d[i]); se += d[i] ** 2;
    if (y[i] !== 0) { ape += Math.abs(d[i] / y[i]); apeN++; }
  }

  let tost: Agreement["tost"] = null;
  if (equivalenceBound && equivalenceBound > 0 && seBias > 0) {
    const pLower = 1 - tCdf((bias + equivalenceBound) / seBias, df);
    const pUpper = tCdf((bias - equivalenceBound) / seBias, df);
    const p = Math.max(pLower, pUpper);
    tost = { bound: equivalenceBound, p, equivalent: p < 0.05 };
  }

  return {
    n, nEff, rho1, bias, sdDiff, loaLow, loaHigh,
    biasCi: [bias - tc * seBias, bias + tc * seBias],
    loaLowCi: [loaLow - tc * seLoa, loaLow + tc * seLoa],
    loaHighCi: [loaHigh - tc * seLoa, loaHigh + tc * seLoa],
    propSlope, ccc, pearsonR: pearson(x.slice(0, n), y.slice(0, n)),
    mae: ae / n, rmse: Math.sqrt(se / n), mape: apeN ? (ape / apeN) * 100 : null,
    tost,
  };
}

import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getDataSources } from "@/lib/ow/api";
import { compareSources, type CompareResult } from "@/lib/domain/compare";
import { todayIn, utcToZonedWall, zonedToUtc } from "@/lib/dates";
import { COMMON_SERIES, isSeriesType, seriesLabel } from "@/lib/series-types";
import { errorMessage } from "@/lib/domain/errors";
import { Card, Notice, fmt, fmtSigned } from "@/components/ui";
import { OwErrors } from "@/components/setup-banner";
import { BlandAltmanPlot, TimeChart } from "@/components/charts";

export const metadata: Metadata = { title: "Compare devices" };

const MAX_HOURS = 48;

export default async function ComparePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const c = ctx.settings.compare;
  let sources: Awaited<ReturnType<typeof getDataSources>> = [];
  let srcErr: string | null = null;
  try { sources = await getDataSources(ctx.ow!); } catch (e) { srcErr = errorMessage(e); }

  const type = sp.type && isSeriesType(sp.type) ? sp.type : "heart_rate";
  // start/end arrive either as ISO instants (deep links) or wall-clock from the form.
  const toInstant = (v: string | undefined, fallback: Date) => !v ? fallback : /Z$|[+-]\d{2}:\d{2}$/.test(v) ? new Date(v) : zonedToUtc(v, tz);
  const now = new Date();
  const endD = toInstant(sp.end, zonedToUtc(`${todayIn(tz)}T08:00`, tz));
  const startD = toInstant(sp.start, new Date(endD.getTime() - 9 * 3600_000));
  const bound = sp.bound && Number(sp.bound) > 0 ? Number(sp.bound) : null;
  const ready = Boolean(sp.a && sp.b && sp.a !== sp.b);
  const hours = (endD.getTime() - startD.getTime()) / 3600_000;
  const badWindow = !(hours > 0) || hours > MAX_HOURS || endD > new Date(now.getTime() + 86400_000);

  let res: CompareResult | null = null;
  let err: string | null = null;
  if (ready && !badWindow) {
    try {
      res = await compareSources(ctx, { type, test: sp.a!, reference: sp.b!, startIso: startD.toISOString(), endIso: endD.toISOString(), bound });
    } catch (e) { err = errorMessage(e); }
  }
  const name = (id?: string) => sources.find((s) => s.id === id)?.display_name ?? id ?? "";
  const label = (s: (typeof sources)[number]) => `${s.display_name}${s.account_label ? ` · ${s.account_label}` : ""}${s.ingestion_route === "aggregator" ? " (relay)" : ""}`;
  const st = res?.stats;
  const u = res?.unit ?? "";

  return (
    <div className="stack-lg">
      <Card title="Agreement between two sources" hint={`epoch ${c.epochSeconds} s · lag search ±${c.lagToleranceSeconds} s (step ${c.lagStepSeconds} s) · change in Settings`}>
        <form method="get" className="form-grid">
          <label className="field">Series
            <select name="type" defaultValue={type}>{COMMON_SERIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          <label className="field">Test device
            <select name="a" defaultValue={sp.a ?? ""} required><option value="">Choose…</option>{sources.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select>
          </label>
          <label className="field">Reference device
            <select name="b" defaultValue={sp.b ?? ""} required><option value="">Choose…</option>{sources.map((s) => <option key={s.id} value={s.id}>{label(s)}</option>)}</select>
          </label>
          <label className="field">From ({tz})<input type="datetime-local" name="start" defaultValue={utcToZonedWall(startD, tz)} /></label>
          <label className="field">To<input type="datetime-local" name="end" defaultValue={utcToZonedWall(endD, tz)} /></label>
          <label className="field">Equivalence bound (±{u || "units"})<input type="number" name="bound" min={0} step="any" defaultValue={bound ?? ""} placeholder="e.g. 5" /><span className="help">For TOST on the bias; leave empty to skip</span></label>
          <div className="row" style={{ alignSelf: "end" }}><button className="btn primary" type="submit">Compare</button></div>
        </form>
      </Card>
      <OwErrors errors={[srcErr, err]} />
      {ready && badWindow && <Notice>Choose a window between 0 and {MAX_HOURS} hours; raw series are fetched in full for both devices.</Notice>}
      {!ready && <p className="small muted">Pick two different data sources and a window (≤ {MAX_HOURS} h). Tip: from a workout recorded by several devices, use “Compare heart rate between devices”.</p>}

      {res && (
        <>
          <div className="grid cols-4">
            <Card><div className="stat-label">Paired epochs</div><div className="stat-value">{fmt(st?.n ?? res.lag.n)}</div><div className="stat-sub">{fmt(res.nTest)} test · {fmt(res.nRef)} reference rows</div></Card>
            <Card><div className="stat-label">Clock lag applied</div><div className="stat-value">{fmtSigned(res.lag.lagSec, 0)}<span className="unit">s</span></div><div className="stat-sub">{res.lag.lagSec === 0 ? "No offset found" : `Reference clock ${res.lag.lagSec > 0 ? "ahead of" : "behind"} test by ${Math.abs(res.lag.lagSec)} s`} · r = {fmt(res.lag.r, 3)}{res.lag.atEdge ? " · at search edge" : ""}</div></Card>
            <Card><div className="stat-label">Bias (test − ref)</div><div className="stat-value">{fmtSigned(st?.bias, 2)}<span className="unit">{u}</span></div><div className="stat-sub">95% CI {fmt(st?.biasCi[0], 2)} to {fmt(st?.biasCi[1], 2)}</div></Card>
            <Card><div className="stat-label">95% limits of agreement</div><div className="stat-value" style={{ fontSize: 22 }}>{fmt(st?.loaLow, 1)} to {fmt(st?.loaHigh, 1)}<span className="unit">{u}</span></div><div className="stat-sub">SD of differences {fmt(st?.sdDiff, 2)}</div></Card>
          </div>
          {res.lag.atEdge && <Notice>The best lag sits at the edge of the ±{c.lagToleranceSeconds} s search. The true offset may be larger: widen the lag tolerance in Settings before trusting these numbers.</Notice>}
          {!st && <Notice>Fewer than {c.minPairs} paired epochs after alignment, so agreement isn&apos;t computed. Check the window covers both devices.</Notice>}

          <Card title={`${seriesLabel(type)} after lag correction`} hint={`${c.epochSeconds}-s epoch means`}>
            <TimeChart ariaLabel="Test and reference series overlaid" xKind={hours <= 24 ? "time" : "datetime"} tz={tz} unit={u} digits={1} height={260}
              series={[
                { id: "ref", label: `Reference · ${name(sp.b)}`, color: "var(--s1)", kind: "line", points: res.overlay.map((o) => [o.t, o.ref]) },
                { id: "test", label: `Test · ${name(sp.a)}`, color: "var(--s2)", kind: "line", points: res.overlay.map((o) => [o.t, o.test]) },
              ]} />
          </Card>

          {st && (
            <div className="grid cols-2">
              <Card title="Bland-Altman" hint="difference vs mean">
                <BlandAltmanPlot means={res.ba.map((p) => p.mean)} diffs={res.ba.map((p) => p.diff)} bias={st.bias} loaLow={st.loaLow} loaHigh={st.loaHigh} unit={u} />
              </Card>
              <Card title="Agreement statistics">
                <table className="t">
                  <tbody>
                    <tr><td>Lin&apos;s CCC</td><td className="num">{fmt(st.ccc, 3)}</td></tr>
                    <tr><td>MAE</td><td className="num">{fmt(st.mae, 2)} {u}</td></tr>
                    <tr><td>RMSE</td><td className="num">{fmt(st.rmse, 2)} {u}</td></tr>
                    <tr><td>MAPE</td><td className="num">{fmt(st.mape, 1)} %</td></tr>
                    <tr><td>Lower LoA 95% CI</td><td className="num">{fmt(st.loaLowCi[0], 1)} to {fmt(st.loaLowCi[1], 1)}</td></tr>
                    <tr><td>Upper LoA 95% CI</td><td className="num">{fmt(st.loaHighCi[0], 1)} to {fmt(st.loaHighCi[1], 1)}</td></tr>
                    <tr><td>Proportional bias (slope of diff on mean)</td><td className="num">{fmtSigned(st.propSlope, 3)}</td></tr>
                    <tr><td>Pearson r (secondary)</td><td className="num">{fmt(st.pearsonR, 3)}</td></tr>
                    <tr><td>Lag-1 autocorrelation of differences</td><td className="num">{fmt(st.rho1, 2)}</td></tr>
                    <tr><td>Effective n used for CIs</td><td className="num">{fmt(st.nEff, 0)} of {st.n}</td></tr>
                    {st.tost && <tr><td>TOST, bias within ±{st.tost.bound} {u}</td><td className="num">{st.tost.equivalent ? "Equivalent" : "Not shown equivalent"} (p = {st.tost.p < 0.001 ? "< 0.001" : st.tost.p.toFixed(3)})</td></tr>}
                  </tbody>
                </table>
                <p className="small muted mt-sm">
                  Epochs from one person over one window are serially dependent, so CIs and TOST use an effective n = n(1−ρ₁)/(1+ρ₁).
                  This is a within-subject, single-session comparison: it describes these two devices on this occasion and does not generalise to a population validity estimate.
                </p>
              </Card>
            </div>
          )}

          <Card title="Lag search" hint="Pearson r of epoch means at each candidate lag (reference shifted)">
            <TimeChart ariaLabel="Correlation by lag" xKind="number" xUnit=" s" digits={3} height={160}
              series={[{ id: "r", label: "r", color: "var(--s7)", kind: "line", points: res.lag.scanned.map((s) => [s.lagSec, s.r]) }]} />
          </Card>
        </>
      )}
      <p className="small muted">Methods: <Link href="/readiness#methods">see the methods notes</Link>.</p>
    </div>
  );
}

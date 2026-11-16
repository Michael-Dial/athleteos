import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getReadiness, type ZComp } from "@/lib/domain/readiness";
import { addDays, fmtDate, fmtDuration, isISODate, todayIn } from "@/lib/dates";
import { REFS } from "@/lib/references";
import { Card, SourceChip, StatePill, fmt, fmtSigned } from "@/components/ui";
import { ReadinessCard } from "@/components/readiness";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { HrvChart, LoadCharts } from "@/components/trend-charts";

export const metadata: Metadata = { title: "Readiness" };

function Ref({ k }: { k: keyof typeof REFS }) {
  return <li><a href={REFS[k].url} target="_blank" rel="noreferrer">{REFS[k].cite}</a></li>;
}

function ZCard({ title, c, unit, sdUnit, format, higherIsWorse }: { title: string; c: ZComp; unit: string; sdUnit?: string; format: (v: number) => string; higherIsWorse?: boolean }) {
  return (
    <Card title={title} action={<StatePill state={c.state} />}>
      <dl className="kv">
        <dt>Device</dt><dd>{c.device ? <SourceChip name={c.device.name} fallback={c.device.fallback} /> : "—"}</dd>
        <dt>Value</dt><dd>{c.z?.value != null ? `${format(c.z.value)} ${unit}` : "—"}{c.stale && <span className="small muted"> (from {fmtDate(c.stale)})</span>}</dd>
        <dt>Baseline</dt><dd>{c.z?.mean != null ? `${format(c.z.mean)} ± ${fmt(c.z.sd, 1)} ${sdUnit ?? unit} (n = ${c.z.n})` : "—"}</dd>
        <dt>z</dt><dd>{fmtSigned(c.z?.z, 2)}{higherIsWorse && c.z?.z != null && <span className="small muted"> (higher is worse)</span>}</dd>
      </dl>
      {c.note && <p className="small muted mt-sm">{c.note}</p>}
    </Card>
  );
}

export default async function ReadinessPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const s = ctx.settings;
  const today = todayIn(s.timezone);
  const date = isISODate(sp.date) && sp.date <= today ? sp.date : today;
  const r = await getReadiness(ctx, date, { historyDays: 56 });
  const hp = r.hrv.point;
  const L = r.load;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Readiness · {fmtDate(date, { weekday: "long", month: "short", day: "numeric" })}</h1><p className="sub">Each pillar against your own baseline. A decision aid from published conventions, not a validated score.</p></div>
        <div className="row">
          <Link className="btn" href={`/readiness?date=${addDays(date, -1)}`}>Previous day</Link>
          {date < today && <Link className="btn" href={`/readiness?date=${addDays(date, 1)}`}>Next day</Link>}
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.errors} />
      <div className="grid cols-3">
        <ReadinessCard r={r} />
        <Card title="HRV" action={<StatePill state={r.hrv.state} />} className="span-2">
          <dl className="kv">
            <dt>Device</dt><dd>{r.hrv.device ? <SourceChip name={r.hrv.device.name} fallback={r.hrv.device.fallback} /> : "—"}</dd>
            <dt>Last night</dt><dd>{hp?.rmssd != null ? `${fmt(hp.rmssd)} ms · ln ${hp.ln!.toFixed(3)}` : "—"}</dd>
            <dt>{s.hrv.rollingDays}-day mean</dt><dd>{hp?.rollingLn != null ? `ln ${hp.rollingLn.toFixed(3)} · ${fmt(hp.rollingMs, 1)} ms (geometric) · n = ${hp.rollingN} · CV ${fmt(hp.rollingCv, 1)}%` : "—"}</dd>
            <dt>{s.hrv.baselineDays}-day baseline</dt><dd>{hp?.baselineLn != null ? `ln ${hp.baselineLn.toFixed(3)} ± ${hp.baselineSd!.toFixed(3)} · n = ${hp.baselineN}` : "—"}</dd>
            <dt>Normal range</dt><dd>{hp?.swcLow != null ? `ln ${hp.swcLow.toFixed(3)}–${hp.swcHigh!.toFixed(3)} · ${fmt(Math.exp(hp.swcLow))}–${fmt(Math.exp(hp.swcHigh!))} ms` : "—"}</dd>
          </dl>
          {r.hrv.note && <p className="small muted mt-sm">{r.hrv.note}</p>}
          <div className="mt"><HrvChart series={r.hrv.series} /></div>
        </Card>
      </div>
      <div className="grid cols-3">
        <ZCard title="Resting HR" c={r.rhr} unit="bpm" format={(v) => fmt(v, 0)} higherIsWorse />
        <ZCard title="Sleep duration" c={r.sleep} unit="" sdUnit="min" format={(v) => fmtDuration(v)} />
        <Card title="Wellness" action={<StatePill state={r.wellness.state} />}>
          <dl className="kv">
            <dt>Composite</dt><dd>{r.wellness.today ? `${fmt(r.wellness.today.composite)} / 100` : "—"}</dd>
            <dt>Baseline</dt><dd>{r.wellness.z?.mean != null ? `${fmt(r.wellness.z.mean)} ± ${fmt(r.wellness.z.sd, 1)} (n = ${r.wellness.z.n})` : "—"}</dd>
            <dt>z</dt><dd>{fmtSigned(r.wellness.z?.z, 2)}</dd>
            <dt>Low items</dt><dd>{r.wellness.lowItems.length ? r.wellness.lowItems.map((i) => `${i.key.replace(/_/g, " ")} (z ${i.z.toFixed(1)})`).join(", ") : "none"}</dd>
          </dl>
          {r.wellness.note && <p className="small muted mt-sm">{r.wellness.note}</p>}
        </Card>
      </div>
      <Card title="Training load" action={<StatePill state={L.state} />}>
        <div className="grid cols-5">
          <div><div className="stat-label">ACWR</div><div className="stat-value">{fmt(L.point?.acwr, 2)}</div><div className="stat-sub">band {s.readiness.acwrLow}–{s.readiness.acwrHigh}</div></div>
          <div><div className="stat-label">Acute ({s.load.acuteDays} d)</div><div className="stat-value">{fmt(L.point?.acute)}</div><div className="stat-sub">AU/day</div></div>
          <div><div className="stat-label">Chronic ({s.load.chronicDays} d)</div><div className="stat-value">{fmt(L.point?.chronic)}</div><div className="stat-sub">AU/day</div></div>
          <div><div className="stat-label">7-day load</div><div className="stat-value">{fmt(L.weekLoad)}</div><div className="stat-sub">AU</div></div>
          <div><div className="stat-label">Monotony / strain</div><div className="stat-value">{fmt(L.monotony, 2)}</div><div className="stat-sub">strain {fmt(L.strain)}</div></div>
        </div>
        <p className="small muted mt-sm">Units: {L.methods.length ? L.methods.map((m) => m.toUpperCase()).join(" + ") : "none yet"} · {s.load.acwrModel === "ewma" ? "EWMA" : "rolling, uncoupled"}. {L.note}</p>
        <div className="mt"><LoadCharts series={L.series} low={s.readiness.acwrLow} high={s.readiness.acwrHigh} /></div>
      </Card>

      <Card title="Methods" className="" hint="how each number is made">
        <div id="methods" className="stack small ink2" style={{ maxWidth: 820 }}>
          <p><b>Device choice.</b> Each metric uses your device priority (Settings → Device priority). With no ranking, the device with the most nights is used and labelled “unranked”. Baselines never mix devices: they are computed from the single device shown on each card. Values from every other device stay visible.</p>
          <p><b>HRV.</b> Nightly RMSSD is log-transformed. The {s.hrv.rollingDays}-day rolling mean of lnRMSSD (needing at least {Math.max(2, Math.ceil((3 / 7) * s.hrv.rollingDays))} nights) is compared with a {s.hrv.baselineDays}-day baseline; the normal range is baseline ± {s.hrv.swcSd} SD, treated as the smallest worthwhile change. Means are back-transformed (geometric means) for display only. A rolling mean below the range flags; above it is reported but not penalised.</p>
          <p><b>Resting HR, sleep, wellness.</b> z-scores against the preceding {s.baselines.windowDays} days (today excluded), with at least {s.baselines.minN} observations; |z| ≥ {s.baselines.zFlag} flags. Wellness items are rescaled to 0–1 (1 = favourable) and averaged into a 0–100 composite.</p>
          <p><b>Load.</b> sRPE = CR-10 RPE × minutes. ACWR by {s.load.acwrModel === "ewma" ? "exponentially weighted moving averages" : "uncoupled rolling averages"}, reported only after {s.load.chronicDays} days of history. The ratio has well-documented conceptual problems; it is shown as context, and only a high ratio lowers the index.</p>
          <p><b>Index.</b> Each pillar becomes a direction-oriented z (positive = favourable), clipped to ±3, and the weighted mean of available pillars is the index. Red at ≤ −{s.baselines.zFlag}; amber if any pillar flags or the index is ≤ −{s.readiness.watchZ}.</p>
          <p><b>Device agreement</b> (Wearables → Compare): epoch means after a lag search, Bland-Altman bias and 95% LoA with approximate CIs, Lin&apos;s CCC, MAE/RMSE, and TOST on the bias. CIs use an effective n corrected for lag-1 autocorrelation.</p>
          <h3 className="mt-sm">References</h3>
          <ul style={{ margin: 0, paddingLeft: 18 }} className="stack">
            <Ref k="plews2012" /><Ref k="plews2013" /><Ref k="plews2014" /><Ref k="buchheit2014" />
            <Ref k="foster2001" /><Ref k="foster1998" /><Ref k="williams2017" /><Ref k="menaspa2017" /><Ref k="lolli2019" />
            <Ref k="gabbett2016" /><Ref k="impellizzeri2020" /><Ref k="mclean2010" /><Ref k="blandAltman1999" /><Ref k="lin1989" />
          </ul>
        </div>
      </Card>
    </div>
  );
}

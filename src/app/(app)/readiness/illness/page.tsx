import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getIllness } from "@/lib/domain/illness";
import { fmtDate } from "@/lib/dates";
import { REFS } from "@/lib/references";
import { Card, Notice, SourceChip, StatePill, fmt, fmtSigned } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import type { SignalKey } from "@/lib/stats/illness";

export const metadata: Metadata = { title: "Illness watch" };

const LABEL: Record<SignalKey, string> = { rhr: "Resting HR ↑", rr: "Respiratory rate ↑", temp: "Skin temp deviation ↑", hrv: "HRV (lnRMSSD) ↓" };
const UNIT: Record<SignalKey, string> = { rhr: "bpm", rr: "br/min", temp: "°C", hrv: "ms" };
const LEVEL = { none: { s: "ok", l: "No signal" }, watch: { s: "watch", l: "Watch" }, alert: { s: "flag", l: "Alert" }, insufficient: { s: "nodata", l: "Not enough data" } } as const;

export default async function IllnessPage() {
  const ctx = await getCtx();
  const r = await getIllness(ctx, undefined, 21);
  const c = ctx.settings.illness;
  const keys = (["rhr", "rr", "temp", "hrv"] as SignalKey[]).filter((k) => r.devices[k]);
  const L = r.latest ? LEVEL[r.latest.level] : LEVEL.insufficient;

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Illness watch</h1><p className="sub">Overnight signals that often shift together at the start of an illness, each against your own baseline. Not a diagnosis.</p></div>
        <Link className="btn" href="/readiness">Readiness</Link>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.owErrors} />
      <div className="grid cols-3">
        <Card title="Latest night" action={<StatePill state={L.s} label={L.l} />}>
          {r.latest ? (
            <>
              <p className="small ink2">{fmtDate(r.latest.date, { weekday: "long", month: "short", day: "numeric" })}: {r.latest.firing} of {r.latest.assessed} signals beyond z {c.z}.</p>
              {r.latest.level === "alert" && <Notice kind="bad">Several signals are elevated{r.latest.firing >= c.minSignals + 1 ? "" : " for a second night"}. Consider an easy day, and check how you feel.</Notice>}
              {r.latest.level === "watch" && <Notice>Two signals moved together. Often noise from late training, alcohol or poor sleep; worth watching tomorrow.</Notice>}
            </>
          ) : <p className="small muted">No assessable nights yet: each signal needs {c.minBaselineN} baseline nights.</p>}
        </Card>
        <Card title="Signals and devices" className="span-2 flush">
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Signal</th><th>Device</th><th className="num">Last night</th><th className="num">Baseline</th><th className="num">z</th><th /></tr></thead>
              <tbody>{(["rhr", "rr", "temp", "hrv"] as SignalKey[]).map((k) => {
                const sig = r.latest?.signals.find((x) => x.key === k);
                const d = r.devices[k];
                const base = sig?.baselineMean != null ? (k === "hrv" ? `${fmt(Math.exp(sig.baselineMean))} ms (ln ${sig.baselineMean.toFixed(2)})` : `${fmt(sig.baselineMean, 1)} ± ${fmt(sig.baselineSd, 1)}`) : "—";
                return (
                  <tr key={k}>
                    <td>{LABEL[k]}</td>
                    <td>{d ? <SourceChip name={d.name} fallback={d.fallback} /> : <span className="small muted">no device reports this</span>}</td>
                    <td className="num">{sig?.value != null ? `${fmt(sig.value, k === "temp" || k === "rr" ? 1 : 0)} ${UNIT[k]}` : "—"}</td>
                    <td className="num small">{base}</td>
                    <td className="num">{fmtSigned(sig?.z, 1)}</td>
                    <td>{sig?.firing ? <StatePill state="watch" label="Beyond" /> : null}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      </div>

      <Card title="Last 21 nights" hint="z oriented so positive = illness direction" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Night</th>{keys.map((k) => <th key={k} className="num">{LABEL[k]}</th>)}<th>Level</th><th>Self-reported</th></tr></thead>
            <tbody>{[...r.nights].reverse().map((n) => {
              const lv = LEVEL[n.level];
              return (
                <tr key={n.date}>
                  <td style={{ whiteSpace: "nowrap" }}>{fmtDate(n.date)}</td>
                  {keys.map((k) => {
                    const sig = n.signals.find((x) => x.key === k);
                    return <td key={k} className="num" style={sig?.firing ? { fontWeight: 700, color: "var(--warn)" } : undefined}>{fmtSigned(sig?.z, 1)}</td>;
                  })}
                  <td>{n.level === "none" ? <span className="small muted">—</span> : <StatePill state={lv.s} label={lv.l} />}</td>
                  <td>{r.selfReported.includes(n.date) ? <StatePill state="watch" label="Ill" /> : null}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

      <Card title="Method">
        <div className="stack small ink2" style={{ maxWidth: 820 }}>
          <p>Each signal compares last night with a {c.baselineDays}-night baseline that ends {c.baselineLagDays} days earlier, so an illness building over several days does not absorb into its own reference. HRV is compared on ln(RMSSD). A signal fires at z ≥ {c.z} in the illness direction. “Watch” means {c.minSignals} signals fired together; “Alert” means that held for two nights running or {c.minSignals + 1}+ fired at once.</p>
          <p>The signals follow wearable studies of pre-symptomatic infection: resting HR (<a href={REFS.mishra2020.url} target="_blank" rel="noreferrer">Mishra 2020</a>, <a href={REFS.quer2021.url} target="_blank" rel="noreferrer">Quer 2021</a>), respiratory rate (<a href={REFS.miller2020.url} target="_blank" rel="noreferrer">Miller 2020</a>) and skin temperature (<a href={REFS.smarr2020.url} target="_blank" rel="noreferrer">Smarr 2020</a>). Those studies used their own algorithms and populations; these thresholds are not validated against them, and training, alcohol, heat and travel move the same signals.</p>
        </div>
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { coverageOrder, getNightly, rankNight } from "@/lib/domain/nightly";
import { getSleepEvents } from "@/lib/ow/api";
import { addDays, fmtDate, fmtDuration, fmtTime, isISODate, localDateWithOffset, todayIn } from "@/lib/dates";
import { deviceName } from "@/lib/stats/sources";
import { stageTotals } from "@/lib/ow/stages";
import { errorMessage } from "@/lib/domain/errors";
import { Card, Empty, NoDeviceData, SourceChip, fmt } from "@/components/ui";
import { latestDeviceDay } from "@/lib/domain/latest";
import { OwErrors } from "@/components/setup-banner";
import { TimeChart } from "@/components/charts";
import { Hypnogram } from "@/components/hypnogram";
import { RangeSeg, pickDays } from "@/components/range-seg";

export const metadata: Metadata = { title: "Sleep" };

const SLOTS = ["var(--s1)", "var(--s2)", "var(--s3)", "var(--s4)", "var(--s5)", "var(--s6)", "var(--s7)", "var(--s8)"];

export default async function SleepPage({ searchParams }: { searchParams: Promise<{ days?: string; night?: string }> }) {
  const sp = await searchParams;
  const days = pickDays(sp.days, [14, 30, 60, 90], 30);
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const night = isISODate(sp.night) ? sp.night : today;
  const start = addDays(today, -days + 1);
  const { rows, owError } = await getNightly(ctx, start < addDays(night, -1) ? start : addDays(night, -1), today);
  let events: Awaited<ReturnType<typeof getSleepEvents>> = [];
  let evError: string | null = null;
  try {
    events = (await getSleepEvents(ctx.ow!, addDays(night, -1), night, { stages: true }))
      .filter((e) => !e.is_nap && localDateWithOffset(e.end_time, e.zone_offset, tz) === night);
  } catch (e) {
    evError = errorMessage(e);
  }
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const keys = coverageOrder(rows, "sleep").slice(0, 8);
  const nameOf = new Map(rows.map((r) => [r.key, r.name]));
  const dates = [...new Set(rows.filter((r) => r.date >= start).map((r) => r.date))].sort().reverse();
  const nightRows = rows.filter((r) => r.date === night && (r.sleepMin != null || r.inBedMin != null));
  const extra = `&night=${night}`;
  // An empty night points back to the latest night any device scored.
  const lastSlept = nightRows.length ? null : rows.filter((r) => r.sleepMin != null && r.date < night).map((r) => r.date).sort().at(-1) ?? null;
  const latest = rows.length && (nightRows.length || lastSlept) ? null : await latestDeviceDay(ctx);

  return (
    <div className="stack-lg">
      <div className="row between">
        <p className="small muted">Night = the date you woke up. Stage minutes are each device&apos;s own scoring.</p>
        <RangeSeg base="/wearables/sleep" days={days} options={[14, 30, 60, 90]} extra={extra} />
      </div>
      <OwErrors errors={[owError, evError]} />
      <Card title="Time asleep by device" hint="main sleep, naps excluded">
        <TimeChart ariaLabel="Sleep duration by device" yAs="duration"
          empty={<NoDeviceData title={`No sleep in the last ${days} days`} latest={latest} />}
          refs={[{ y: ctx.settings.readiness.sleepTargetMin, label: `target ${fmtDuration(ctx.settings.readiness.sleepTargetMin)}` }]}
          series={keys.map((k, i) => ({ id: k, label: nameOf.get(k)!, color: SLOTS[i], kind: "line" as const,
            points: rows.filter((r) => r.key === k && r.date >= start).map((r) => [dx(r.date), r.sleepMin] as [number, number | null]) }))} />
      </Card>

      <Card title={`Night of ${fmtDate(night, { weekday: "long", month: "short", day: "numeric" })}`} hint={`${nightRows.length} device${nightRows.length === 1 ? "" : "s"}`}
        action={<div className="row"><Link className="btn sm" href={`/wearables/sleep?days=${days}&night=${addDays(night, -1)}`}>Previous night</Link>{night < today && <Link className="btn sm" href={`/wearables/sleep?days=${days}&night=${addDays(night, 1)}`}>Next night</Link>}</div>}>
        {nightRows.length === 0 ? (lastSlept ? (
          <Empty title="No sleep recorded for this night"
            action={<Link className="btn sm" href={`/wearables/sleep?days=${days}&night=${lastSlept}`}>Show {fmtDate(lastSlept, { weekday: "short", month: "short", day: "numeric" })}</Link>}>
            The latest night a device scored is {fmtDate(lastSlept, { month: "short", day: "numeric" })}.
          </Empty>
        ) : <NoDeviceData title="No sleep recorded for this night" latest={latest} />) : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Device</th><th>Bed – wake</th><th className="num">Asleep</th><th className="num">In bed</th><th className="num">Eff. %</th><th className="num">Deep</th><th className="num">REM</th><th className="num">Light</th><th className="num">Awake</th><th className="num">RMSSD</th><th className="num">RHR</th></tr></thead>
              <tbody>
                {nightRows.map((r) => (
                  <tr key={r.key}>
                    <td><SourceChip name={r.name} /></td>
                    <td className="small">{r.start && r.end ? `${fmtTime(r.start, tz)} – ${fmtTime(r.end, tz)}` : "—"}</td>
                    <td className="num">{fmtDuration(r.sleepMin)}</td>
                    <td className="num">{fmtDuration(r.inBedMin)}</td>
                    <td className="num">{fmt(r.efficiency, 0)}</td>
                    <td className="num">{fmtDuration(r.deep)}</td>
                    <td className="num">{fmtDuration(r.rem)}</td>
                    <td className="num">{fmtDuration(r.light)}</td>
                    <td className="num">{fmtDuration(r.awake)}</td>
                    <td className="num">{fmt(r.hrv)}</td>
                    <td className="num">{fmt(r.rhr)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {events.length > 0 && (
        <div className="grid cols-2">
          {events.map((e) => {
            const t = e.sleep_stage_intervals ? stageTotals(e.sleep_stage_intervals) : null;
            const folded = e.sleep_stage_intervals?.some((i) => i.vendor_stage);
            return (
              <Card key={e.id} title={deviceName(e.source)} hint={`${fmtTime(e.start_time, tz)} – ${fmtTime(e.end_time, tz)}${folded ? " · reference stages folded from vendor labels" : ""}`}>
                {e.sleep_stage_intervals?.length ? <Hypnogram intervals={e.sleep_stage_intervals} tz={tz} /> : <p className="small muted">No stage timeline from this device.</p>}
                {t && <p className="small ink2 mt-sm">Deep {fmtDuration(t.deep)} · REM {fmtDuration(t.rem)} · Light {fmtDuration(t.light)} · Awake {fmtDuration(t.awake)}{e.derived_from_stages ? ` · WASO ${fmt(e.derived_from_stages.waso_minutes)} min · ${e.derived_from_stages.awakenings} awakenings` : ""}</p>}
              </Card>
            );
          })}
        </div>
      )}

      <Card title="Nights" className="flush" hint="primary device by your sleep priority">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Night</th><th className="num">Asleep</th><th className="num">Eff. %</th><th className="num">Deep</th><th className="num">REM</th><th>Primary device</th><th className="num">Devices</th></tr></thead>
            <tbody>
              {dates.map((d) => {
                const rk = rankNight(ctx, rows, d, "sleep");
                const p = rk.primary;
                return (
                  <tr key={d}>
                    <td><Link href={`/wearables/sleep?days=${days}&night=${d}`}>{fmtDate(d)}</Link></td>
                    <td className="num">{fmtDuration(p?.sleepMin)}</td>
                    <td className="num">{fmt(p?.efficiency)}</td>
                    <td className="num">{fmtDuration(p?.deep)}</td>
                    <td className="num">{fmtDuration(p?.rem)}</td>
                    <td>{p ? <SourceChip name={p.name} fallback={rk.fallback} /> : "—"}</td>
                    <td className="num">{rk.others.length + (p ? 1 : 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

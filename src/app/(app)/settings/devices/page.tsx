import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getNightly, METRIC_VALUE } from "@/lib/domain/nightly";
import { getWorkouts } from "@/lib/ow/api";
import { addDays, fmtDate, todayIn, localDate } from "@/lib/dates";
import { deviceKey, deviceName } from "@/lib/stats/sources";
import { METRICS, METRIC_LABEL, type Metric } from "@/lib/settings";
import { errorMessage } from "@/lib/domain/errors";
import { Card } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { PriorityEditor, type DeviceOpt } from "@/components/priority-editor";
import { toggleTrainingDeviceExcluded, updateDevicePriority } from "../../actions";

export const metadata: Metadata = { title: "Device priority" };

export default async function DevicePriorityPage({ searchParams }: { searchParams: Promise<{ metric?: string; saved?: string }> }) {
  const sp = await searchParams;
  const metric: Metric = (METRICS as readonly string[]).includes(sp.metric ?? "") ? (sp.metric as Metric) : "hrv";
  const ctx = await getCtx();
  if (!ctx.ow) return <SetupBanner ctx={ctx} />;
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const opts = new Map<string, DeviceOpt>();
  let err: string | null = null;
  if (metric === "workouts") {
    try {
      for (const w of await getWorkouts(ctx.ow, addDays(today, -90), today)) {
        const k = deviceKey(w.source);
        const o = opts.get(k) ?? { key: k, name: deviceName(w.source), count: 0, last: null };
        o.count++;
        const d = localDate(w.start_time, tz);
        if (!o.last || d > o.last) o.last = d;
        opts.set(k, o);
      }
    } catch (e) { err = errorMessage(e); }
  } else {
    const n = await getNightly(ctx, addDays(today, -60), today);
    err = n.owError;
    for (const r of n.rows) {
      if (METRIC_VALUE[metric](r) == null) continue;
      const o = opts.get(r.key) ?? { key: r.key, name: r.name, count: 0, last: null };
      o.count++;
      if (!o.last || r.date > o.last) o.last = r.date;
      opts.set(r.key, o);
    }
  }
  for (const o of opts.values()) o.last = o.last ? fmtDate(o.last, { month: "short", day: "numeric" }) : null;
  const saved = ctx.settings.devicePriority[metric] ?? [];
  const ranked = saved.map((k) => opts.get(k) ?? { key: k, name: `${k.slice(0, 8)}… (no recent data)`, count: 0, last: null });
  const unranked = [...opts.values()].filter((o) => !saved.includes(o.key)).sort((a, b) => b.count - a.count);
  const excluded = new Set(ctx.settings.training.excludeDevices);

  return (
    <div className="stack-lg">
      <div className="seg" style={{ alignSelf: "flex-start", flexWrap: "wrap" }}>
        {METRICS.map((m) => <Link key={m} href={`/settings/devices?metric=${m}`} className={m === metric ? "on" : ""}>{METRIC_LABEL[m]}</Link>)}
      </div>
      <OwErrors errors={[err]} />
      {sp.saved && <p className="small" style={{ color: "var(--good)" }} role="status">Ranking saved.</p>}
      <div className="grid cols-2">
        <Card title={`${METRIC_LABEL[metric]}: device ranking`} hint={metric === "workouts" ? "last 90 days" : "last 60 nights"}>
          <PriorityEditor key={metric + saved.join()} action={updateDevicePriority} metric={metric} ranked={ranked} unranked={unranked} countLabel={metric === "workouts" ? "workouts" : "nights"} />
        </Card>
        <Card title="How ranking is used">
          <div className="stack small ink2">
            <p>The first ranked device with data for a night (or a workout) becomes the primary value. Every other device&apos;s value stays listed beside it; nothing is discarded.</p>
            <p>For HRV, resting HR and sleep, the baseline uses only the top-ranked device that reported in the last 3 days, so a ring and a watch are never pooled.</p>
            <p>For workouts, the ranking picks which recording represents a session recorded by several devices (its HR, duration and distance drive load).</p>
          </div>
          {metric === "workouts" && (
            <div className="mt">
              <h3>Exclude devices from training</h3>
              <p className="small muted">For devices that log non-training captures as workouts.</p>
              <ul className="stack" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {[...opts.values()].sort((a, b) => b.count - a.count).map((o) => (
                  <li key={o.key} className="row between">
                    <span>{o.name}</span>
                    <form action={toggleTrainingDeviceExcluded}>
                      <input type="hidden" name="device" value={o.key} /><input type="hidden" name="back" value="/settings/devices?metric=workouts" />
                      <button className={`btn sm${excluded.has(o.key) ? "" : ""}`} type="submit">{excluded.has(o.key) ? "Include again" : "Exclude"}</button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

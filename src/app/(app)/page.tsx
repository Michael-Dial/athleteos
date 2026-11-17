import Link from "next/link";
import { getCtx } from "@/lib/domain/context";
import { requireUser } from "@/lib/current-user";
import { redirect } from "next/navigation";
import { getReadiness, type Readiness } from "@/lib/domain/readiness";
import { getIllness } from "@/lib/domain/illness";
import { listPlanSessions, matchPlan } from "@/lib/domain/plan";
import { getTraining } from "@/lib/domain/training";
import { isDue, listDefs, listWellness } from "@/lib/domain/questionnaires";
import { rankNight, seriesFor } from "@/lib/domain/nightly";
import { getSleepEvents } from "@/lib/ow/api";
import { deviceKey } from "@/lib/stats/sources";
import { addDays, fmtDate, fmtDuration, fmtTime, localDateWithOffset, startOfWeek, todayIn } from "@/lib/dates";
import { SPORT_LABEL, isSportFamily, type SportFamily } from "@/lib/sports";
import { Card, SourceChip } from "@/components/ui";
import { OwErrors, SetupBanner } from "@/components/setup-banner";
import { Hypnogram } from "@/components/hypnogram";
import { ReadinessGauge, SPORT_COLOR, Sparkline, WeekStrip, ZScale, type DayColumn, type VizState } from "@/components/viz";
import { TimeChart } from "@/components/charts";

const OVERALL: Record<Readiness["overall"], { label: string; state: VizState; line: string }> = {
  green: { label: "Ready", state: "ok", line: "Recovery markers sit inside your normal ranges." },
  amber: { label: "Caution", state: "watch", line: "Something is outside your normal range. Train with that in mind." },
  red: { label: "Back off", state: "flag", line: "Several markers are well below baseline. An easy day is the safer call." },
  unknown: { label: "Building", state: "nodata", line: "Baselines are still forming." },
};
const STATE_WORD: Record<VizState, string> = { ok: "Normal", watch: "Watch", flag: "Flag", nodata: "No data" };
const STATE_COLOR: Record<VizState, string> = { ok: "var(--good)", watch: "var(--warn)", flag: "var(--bad)", nodata: "var(--muted)" };

function last<T>(m: Map<string, T>, days: string[]): (T | null)[] {
  return days.map((d) => m.get(d) ?? null);
}

export default async function TodayPage() {
  const ctx = await getCtx();
  // New people start with the short setup; viewing someone else never does.
  if (!ctx.viewing && !(await requireUser()).onboarded) redirect("/welcome");
  const s = ctx.settings;
  const tz = s.timezone;
  const today = todayIn(tz);
  const weekStart = startOfWeek(today);
  const days14 = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const days30 = Array.from({ length: 30 }, (_, i) => addDays(today, i - 29));

  const [r, ill, plan, week, defs, wellness, events] = await Promise.all([
    getReadiness(ctx, today, { historyDays: 30 }),
    getIllness(ctx, today, 3),
    listPlanSessions(ctx.athlete.id, weekStart, addDays(weekStart, 6)),
    getTraining(ctx, weekStart, today),
    listDefs(ctx.athlete.id),
    listWellness(ctx.athlete.id, days14[0], today),
    ctx.ow ? getSleepEvents(ctx.ow, addDays(today, -1), today, { stages: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const due = [];
  for (const d of defs) if (await isDue(d, today, weekStart)) due.push(d);
  const o = OVERALL[r.overall];
  // While baselines form, say how long it takes and how far along it is.
  const need = s.hrv.minBaselineN;
  const nights = r.hrv.device ? seriesFor(r.nightly, r.hrv.device.key, "hrv").size : 0;
  const building = !ctx.ow
    ? "Connect a wearable and your readiness starts building from the first night."
    : `Readiness appears after about ${need} nights of data${nights ? `: ${Math.min(nights, need)} of ${need} so far` : ""}.`;

  // ---- pillars: one sparkline + one position on the shared SD scale each
  const nightSeries = (metric: "hrv" | "rhr" | "sleep", key: string | undefined) => (key ? seriesFor(r.nightly, key, metric) : new Map<string, number>());
  const hrvSer = nightSeries("hrv", r.hrv.device?.key);
  const rhrSer = nightSeries("rhr", r.rhr.device?.key);
  const sleepSer = nightSeries("sleep", r.sleep.device?.key);
  const wMap = new Map(wellness.map((w) => [w.date, Number(w.composite)]));
  const loadMap = new Map(r.load.series.map((p) => [p.date, p.load]));
  const pillars: { name: string; href: string; values: (number | null)[]; kind?: "bars"; z: number | null; state: VizState; val: string; title: string }[] = [
    { name: "HRV", href: "/readiness", values: last(hrvSer, days14), z: r.hrv.signed, state: r.hrv.state, val: r.hrv.point?.rmssd ? `${Math.round(r.hrv.point.rmssd)} ms` : "—", title: "Nightly RMSSD, 14 days" },
    { name: "Resting HR", href: "/readiness", values: last(rhrSer, days14), z: r.rhr.signed, state: r.rhr.state, val: r.rhr.z?.value != null ? `${Math.round(r.rhr.z.value)} bpm` : "—", title: "Resting HR, 14 days" },
    { name: "Sleep", href: "/wearables/sleep", values: last(sleepSer, days14), z: r.sleep.signed, state: r.sleep.state, val: r.sleep.z?.value != null ? fmtDuration(r.sleep.z.value) : "—", title: "Time asleep, 14 days" },
    { name: "Wellness", href: "/wellness", values: last(wMap, days14), z: r.wellness.signed, state: r.wellness.state, val: r.wellness.today ? `${Math.round(Number(r.wellness.today.composite))}/100` : "—", title: "Wellness composite, 14 days" },
    { name: "Load", href: "/history", values: last(loadMap, days14), kind: "bars", z: r.load.signed, state: r.load.state, val: r.load.point?.acwr != null ? `ACWR ${r.load.point.acwr.toFixed(2)}` : "—", title: "Daily load, 14 days" },
  ];

  // ---- last night: the sleep device's stage timeline + three vitals
  const sleepRank = rankNight(ctx, r.nightly, today, "sleep");
  const sp = sleepRank.primary;
  const night = sp ? events.find((e) => !e.is_nap && deviceKey(e.source) === sp.key && localDateWithOffset(e.end_time, e.zone_offset, tz) === today) : undefined;
  const hp = r.hrv.point;
  const hrvBand: [number, number] | null = hp?.swcLow != null ? [Math.exp(hp.swcLow), Math.exp(hp.swcHigh!)] : null;
  const rz = r.rhr.z;
  const rhrBand: [number, number] | null = rz?.mean != null && rz.sd != null ? [rz.mean - rz.sd, rz.mean + rz.sd] : null;
  const rrRank = rankNight(ctx, r.nightly, today, "respiratory_rate");
  const rrSer = rrRank.primary ? seriesFor(r.nightly, rrRank.primary.key, "respiratory_rate") : new Map<string, number>();

  // ---- this week: done (stacked by sport) vs planned (outline)
  const { matches } = matchPlan(plan, week.sessions);
  const dayCols: DayColumn[] = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return {
      date: d, isToday: d === today, label: fmtDate(d, { weekday: "short" }).slice(0, 3).toUpperCase(),
      plannedMin: plan.filter((p) => p.date === d && !p.skipped).reduce((a, p) => a + (p.planned_duration_min ?? 0), 0),
      sessions: week.sessions.filter((x) => x.date === d && !x.excluded).map((x) => ({ family: x.family, minutes: x.durationMin ?? 0, title: x.title })),
    };
  });
  const familiesThisWeek = [...new Set(dayCols.flatMap((d) => d.sessions.map((x) => x.family)))] as SportFamily[];
  const todayPlan = matches.filter((m) => m.plan.date === today);
  const dx = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const loadSeries = r.load.series.slice(-28);

  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <div className="kicker">{fmtDate(today, { weekday: "long", month: "long", day: "numeric" })}</div>
          <h1>Today</h1>
        </div>
      </div>
      <SetupBanner ctx={ctx} />
      <OwErrors errors={r.errors} />
      {ill.latest && (ill.latest.level === "watch" || ill.latest.level === "alert") && (
        <div className={`banner${ill.latest.level === "alert" ? "" : " warn"}`} role="status">
          <span><b className="display" style={{ letterSpacing: "0.06em", textTransform: "uppercase" }}>Illness watch · {ill.latest.level}</b>{"  "}
            {ill.latest.signals.filter((x) => x.firing).map((x) => ({ rhr: "resting HR up", rr: "breathing rate up", temp: "skin temp up", hrv: "HRV down" })[x.key]).join(" · ")}</span>
          <Link href="/readiness/illness">See signals</Link>
        </div>
      )}

      {due.length > 0 && (
        <Card className="checkin-due">
          <div className="row between" style={{ gap: 12, flexWrap: "wrap" }}>
            <div>
              <div className="stat-label">Check-in due</div>
              <div className="small ink2">About a minute. It feeds today&apos;s readiness.</div>
            </div>
            <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
              {due.map((d) => <Link key={d.id} href={`/wellness/${d.slug}`} className="btn primary">{d.schedule === "daily" ? "Start morning check-in" : `Start ${lowerFirst(d.name)}`}</Link>)}
            </div>
          </div>
        </Card>
      )}

      <div className="today-hero">
        <Card>
          <div className="stack" style={{ alignItems: "center", gap: 6 }}>
            <ReadinessGauge index={r.index} state={o.state} label={o.label} zFlag={s.baselines.zFlag} watchZ={s.readiness.watchZ} />
            <p className="small ink2" style={{ textAlign: "center", maxWidth: 280 }}>{r.overall === "unknown" ? building : o.line}</p>
            <Link className="small" href="/readiness">How this is worked out</Link>
          </div>
        </Card>
        <Card title="Pillars" hint="14 days · position vs your baseline">
          {pillars.map((p) => (
            <div key={p.name} className="pillar">
              <Link className="name" href={p.href}>{p.name}</Link>
              <div className="spark"><Sparkline values={p.values} kind={p.kind} width={260} height={34} color={p.state === "nodata" ? "var(--muted)" : "var(--graph)"} title={p.title} /></div>
              <div className="z"><ZScale z={p.z} state={p.state} watchZ={s.readiness.watchZ} title={`${p.name}: ${p.z == null ? "no baseline yet" : `${p.z > 0 ? "+" : ""}${p.z.toFixed(1)} SD vs baseline`}`} /></div>
              <div className="val"><span className="state" style={{ color: STATE_COLOR[p.state] }}>{p.state === "nodata" && p.val !== "—" ? "Building" : STATE_WORD[p.state]}</span><div>{p.val}</div></div>
            </div>
          ))}
        </Card>
      </div>

      {ctx.ow && (
        <Card title="Last night" action={sp ? <SourceChip name={sp.name} fallback={sleepRank.fallback} /> : undefined}>
          <div className="night">
            <div className="stack">
              <div className="row" style={{ alignItems: "baseline", gap: 14 }}>
                <span className="big">{sp?.sleepMin != null ? fmtDuration(sp.sleepMin) : "—"}</span>
                {sp?.start && sp.end && <span className="ink2">{fmtTime(sp.start, tz)} → {fmtTime(sp.end, tz)}</span>}
              </div>
              {night?.sleep_stage_intervals?.length ? <Hypnogram intervals={night.sleep_stage_intervals} tz={tz} height={110} /> : <p className="small muted">No stage timeline from this device last night.</p>}
            </div>
            <div>
              {[
                { name: "HRV", ser: hrvSer, band: hrvBand, now: hp?.rmssd ?? null, unit: "ms", d: 0, dev: r.hrv.device },
                { name: "Resting HR", ser: rhrSer, band: rhrBand, now: r.rhr.z?.value ?? null, unit: "bpm", d: 0, dev: r.rhr.device },
                { name: "Breathing", ser: rrSer, band: null, now: rrRank.primary?.rr ?? null, unit: "br/min", d: 1, dev: rrRank.primary ? { name: rrRank.primary.name, fallback: rrRank.fallback } : null },
              ].map((v) => (
                <div key={v.name} className="vital">
                  <div>
                    <div className="stat-label">{v.name}</div>
                    <div className="mid">{v.now != null ? v.now.toFixed(v.d) : "—"}<span className="u">{v.unit}</span></div>
                  </div>
                  <div style={{ width: 170 }}><Sparkline values={last(v.ser, days30)} band={v.band} width={170} height={44} title={`${v.name}, 30 days${v.band ? " · band = your normal range" : ""}${v.dev ? ` · ${v.dev.name}` : ""}`} /></div>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}

      <div className="grid cols-2">
        <Card title="This week" hint="done, stacked by sport · dashed = planned" action={<Link className="small" href="/review">Weekly review</Link>}>
          <WeekStrip days={dayCols} />
          {familiesThisWeek.length > 0 && (
            <div className="legend-dots mt-sm">{familiesThisWeek.map((f) => <span key={f}><i style={{ background: SPORT_COLOR[f] }} />{SPORT_LABEL[f]}</span>)}</div>
          )}
        </Card>
        <Card title="Up next">
          <div className="stack">
            {todayPlan.length === 0 ? (
              <p className="ink2">Nothing planned today. <Link href="/plan">Open the plan</Link></p>
            ) : todayPlan.map(({ plan: p, actual }) => (
              <div key={p.id} className="row between" style={{ gap: 12 }}>
                <div className="row" style={{ gap: 12 }}>
                  <span style={{ width: 6, alignSelf: "stretch", borderRadius: 3, background: isSportFamily(p.sport) ? SPORT_COLOR[p.sport] : "var(--line-strong)" }} />
                  <div>
                    <div className="mid" style={{ fontSize: 24 }}>{p.title}</div>
                    <div className="small ink2">{[isSportFamily(p.sport) ? SPORT_LABEL[p.sport] : p.sport, p.planned_duration_min ? fmtDuration(p.planned_duration_min) : null, p.intensity].filter(Boolean).join(" · ")}</div>
                  </div>
                </div>
                <span className="kicker" style={{ color: actual ? "var(--good)" : "var(--muted)" }}>{actual ? "Done" : p.skipped ? "Skipped" : "To do"}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {loadSeries.some((p) => p.load > 0) && (
        <Card title="Load" hint="daily, 4 weeks" action={<Link className="small" href="/trends">Trends</Link>}>
          <TimeChart ariaLabel="Daily training load, 4 weeks" height={150} series={[{ id: "load", label: "Load", color: "var(--graph)", kind: "bar", points: loadSeries.map((p) => [dx(p.date), p.load || null]) }]} />
        </Card>
      )}
    </div>
  );
}

/** "Weekly check-in" → "weekly check-in" after a verb; leaves acronyms such as "RPE log" alone. */
function lowerFirst(s: string): string {
  return /^[A-Z][a-z]/.test(s) ? s[0].toLowerCase() + s.slice(1) : s;
}

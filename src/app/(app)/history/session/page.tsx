import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { getTraining } from "@/lib/domain/training";
import { listPlanSessions } from "@/lib/domain/plan";
import { addDays, fmtDate, fmtDuration, fmtTime, isISODate, todayIn } from "@/lib/dates";
import { deviceName } from "@/lib/stats/sources";
import { SPORT_LABEL } from "@/lib/sports";
import { Card, Notice, SourceChip, fmt } from "@/components/ui";
import { OwErrors } from "@/components/setup-banner";
import { ManualSessionForm, RPE_HELP } from "@/components/session-form";
import { annotateWorkout, deleteManualSession } from "../../actions";

export const metadata: Metadata = { title: "Session" };

export default async function SessionPage({ searchParams }: { searchParams: Promise<{ key?: string; date?: string }> }) {
  const { key = "", date } = await searchParams;
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const today = todayIn(tz);
  const d = isISODate(date) ? date : today;
  const { sessions, owError } = await getTraining(ctx, addDays(d, -1), addDays(d, 1));
  const id = key.replace(/^(ow|manual):/, "");
  const s = sessions.find((x) => x.key === key || x.recordings.some((r) => r.id === id));
  if (!s) {
    if (owError) return <OwErrors errors={[owError]} />;
    notFound();
  }
  const plan = await listPlanSessions(ctx.athlete.id, addDays(s.date, -3), addDays(s.date, 3));
  const planOptions = plan.map((p) => ({ id: p.id, label: `${fmtDate(p.date)} · ${p.title}` }));
  const back = `/history/session?key=${encodeURIComponent(s.key)}&date=${s.date}`;

  if (s.manual) {
    return (
      <div className="stack-lg">
        <div className="page-head"><div><h1>{s.title}</h1><p className="sub">{fmtDate(s.date)} · logged manually</p></div><Link href="/history" className="btn">Back to history</Link></div>
        <Card title="Edit session"><ManualSessionForm today={today} back={back} existing={s.manual} planOptions={planOptions} /></Card>
        <form action={deleteManualSession}>
          <input type="hidden" name="id" value={s.manual.id} />
          <input type="hidden" name="back" value="/history" />
          <button className="btn danger" type="submit">Delete “{s.title}”</button>
        </form>
      </div>
    );
  }

  const a = s.annotation;
  const recs = s.recordings;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div>
          <h1>{s.title}</h1>
          <p className="sub">{fmtDate(s.date, { weekday: "long", month: "long", day: "numeric" })}{s.start && ` · ${fmtTime(s.start, tz)}`} · {SPORT_LABEL[s.family]}</p>
        </div>
        <Link href="/history" className="btn">Back to history</Link>
      </div>
      {s.excluded && <Notice>Excluded from load and plan matching: {s.excluded}.</Notice>}

      <Card title={`Recorded by ${recs.length} device${recs.length === 1 ? "" : "s"}`} hint="primary chosen by your workout device priority; all copies shown" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Device</th><th>Start</th><th className="num">Duration</th><th className="num">Avg HR</th><th className="num">Max HR</th><th className="num">Distance</th><th className="num">kcal</th><th className="num">Avg W</th><th>Type</th></tr></thead>
            <tbody>
              {recs.map((r, i) => (
                <tr key={r.id}>
                  <td><SourceChip name={deviceName(r.source)} />{i === 0 && <span className="small muted"> primary</span>}</td>
                  <td>{fmtTime(r.start_time, tz)}</td>
                  <td className="num">{fmtDuration(r.duration_seconds != null ? r.duration_seconds / 60 : null)}</td>
                  <td className="num">{fmt(r.avg_heart_rate_bpm)}</td>
                  <td className="num">{fmt(r.max_heart_rate_bpm)}</td>
                  <td className="num">{r.distance_meters != null ? `${fmt(r.distance_meters / 1000, 2)} km` : "—"}</td>
                  <td className="num">{fmt(r.calories_kcal)}</td>
                  <td className="num">{fmt(r.average_watts)}</td>
                  <td className="small">{r.type}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {recs.length > 1 && recs[0].source.data_source_id && (
          <div style={{ padding: "8px 16px 16px" }}>
            <Link className="btn sm" href={`/wearables/compare?type=heart_rate&a=${recs[1].source.data_source_id ?? ""}&b=${recs[0].source.data_source_id}&start=${encodeURIComponent(recs[0].start_time)}&end=${encodeURIComponent(recs[0].end_time)}`}>
              Compare heart rate between devices
            </Link>
          </div>
        )}
      </Card>

      <Card title="Your annotation" hint="stored in AthleteOS; the device's own record is untouched">
        <form action={annotateWorkout} className="stack">
          <input type="hidden" name="ow_workout_id" value={s.primary!.id} />
          <input type="hidden" name="date" value={s.date} />
          <input type="hidden" name="start_time" value={s.start ?? ""} />
          <input type="hidden" name="sport" value={s.family} />
          <input type="hidden" name="duration_min" value={s.durationMin ?? 0} />
          <input type="hidden" name="back" value={back} />
          <div className="form-grid">
            <label className="field">Session RPE<input type="number" name="rpe" min={0} max={10} step={0.5} defaultValue={a?.rpe ?? ""} /><span className="help">{RPE_HELP}</span></label>
            <label className="field">Title<input name="title" defaultValue={a?.title ?? ""} placeholder={s.title} /></label>
            <label className="field">Fulfils planned session
              <select name="plan_session_id" defaultValue={a?.plan_session_id ?? ""}>
                <option value="">Auto-match by day and sport</option>
                {planOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </label>
            <label className="field wide">Notes<textarea name="notes" defaultValue={a?.notes ?? ""} /></label>
            <label className="row wide" style={{ fontSize: 13 }}>
              <input type="checkbox" name="excluded" defaultChecked={a?.excluded ?? false} /> Not training: exclude from load and plan matching
            </label>
          </div>
          <div className="row"><button className="btn primary" type="submit">Save annotation</button></div>
        </form>
      </Card>
    </div>
  );
}

import Link from "next/link";
import type { Metadata } from "next";
import { getCtx } from "@/lib/domain/context";
import { listAllPhases, PHASE_KINDS, type PlanPhase } from "@/lib/domain/plan";
import { addDays, diffDays, fmtDate, todayIn } from "@/lib/dates";
import { Card, Empty, Notice } from "@/components/ui";
import { deletePhase, savePhase } from "../../actions";

export const metadata: Metadata = { title: "Phases" };

function PhaseForm({ existing, today }: { existing?: PlanPhase; today: string }) {
  return (
    <form action={savePhase} className="stack">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <div className="form-grid">
        <label className="field">Name<input name="name" defaultValue={existing?.name ?? ""} placeholder="e.g. Marathon build 1" required /></label>
        <label className="field">Kind
          <select name="kind" defaultValue={existing?.kind ?? "build"}>
            {PHASE_KINDS.map((k) => <option key={k} value={k}>{k[0].toUpperCase() + k.slice(1)}</option>)}
          </select>
        </label>
        <label className="field">Start<input type="date" name="start_date" defaultValue={existing?.start_date ?? today} required /></label>
        <label className="field">End<input type="date" name="end_date" defaultValue={existing?.end_date ?? addDays(today, 27)} required /></label>
        <label className="field wide">Goal<input name="goal" defaultValue={existing?.goal ?? ""} placeholder="What this block should achieve" /></label>
        <label className="field wide">Notes<textarea name="notes" defaultValue={existing?.notes ?? ""} /></label>
      </div>
      <div className="row"><button className="btn primary" type="submit">{existing ? "Save phase" : "Add phase"}</button></div>
    </form>
  );
}

export default async function PhasesPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const sp = await searchParams;
  const ctx = await getCtx();
  const today = todayIn(ctx.settings.timezone);
  const phases = await listAllPhases(ctx.athlete.id);
  const editing = sp.edit ? phases.find((p) => p.id === Number(sp.edit)) : undefined;
  return (
    <div className="stack-lg">
      <div className="page-head">
        <div><h1>Training phases</h1><p className="sub">Periodisation blocks. Sessions attach to the phase covering their date automatically.</p></div>
        <Link className="btn" href="/plan">Back to calendar</Link>
      </div>
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      <Card className="flush" title="Phases">
        {phases.length === 0 ? <Empty title="No phases yet">Add your first block below; overlapping phases are allowed (the latest-starting one wins).</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Phase</th><th>Kind</th><th>Dates</th><th className="num">Weeks</th><th>Goal</th><th /></tr></thead>
              <tbody>
                {phases.map((p) => (
                  <tr key={p.id}>
                    <td><b>{p.name}</b>{today >= p.start_date && today <= p.end_date && <span className="pill ok" style={{ marginLeft: 8 }}>Current</span>}</td>
                    <td>{p.kind}</td>
                    <td>{fmtDate(p.start_date, { month: "short", day: "numeric", year: "numeric" })} – {fmtDate(p.end_date, { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td className="num">{((diffDays(p.end_date, p.start_date) + 1) / 7).toFixed(1)}</td>
                    <td className="small">{p.goal}</td>
                    <td className="num">
                      <div className="row" style={{ justifyContent: "flex-end" }}>
                        <Link className="btn sm" href={`/plan/phases?edit=${p.id}`}>Edit</Link>
                        <form action={deletePhase}><input type="hidden" name="id" value={p.id} /><button className="btn sm danger" type="submit">Delete {p.name}</button></form>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title={editing ? `Edit ${editing.name}` : "Add a phase"}>
        <PhaseForm key={editing?.id ?? "new"} existing={editing} today={today} />
      </Card>
    </div>
  );
}

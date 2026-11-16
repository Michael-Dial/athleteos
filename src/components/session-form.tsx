import { SPORT_FAMILIES, SPORT_LABEL } from "@/lib/sports";
import { logManualSession } from "@/app/(app)/actions";
import type { ManualSession } from "@/lib/domain/training";

/** CR-10 anchors (Foster et al. 2001) shown beside every RPE input. */
export const RPE_HELP = "CR-10, ~30 min after: 0 rest · 3 moderate · 5 hard · 7 very hard · 10 maximal";

export function ManualSessionForm({ today, back, existing, planOptions = [] }: { today: string; back: string; existing?: ManualSession; planOptions?: { id: number; label: string }[] }) {
  return (
    <form action={logManualSession} className="stack">
      {existing && <input type="hidden" name="id" value={existing.id} />}
      <input type="hidden" name="back" value={back} />
      <div className="form-grid">
        <label className="field">Date<input type="date" name="date" defaultValue={existing?.date ?? today} required /></label>
        <label className="field">Sport
          <select name="sport" defaultValue={existing?.sport ?? "run"}>
            {SPORT_FAMILIES.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}
          </select>
        </label>
        <label className="field">Title<input name="title" defaultValue={existing?.title ?? ""} placeholder="e.g. Gym — lower body" /></label>
        <label className="field">Duration (min)<input type="number" name="duration_min" min={1} step="any" defaultValue={existing?.duration_min ?? ""} required /></label>
        <label className="field">Distance (km)<input type="number" name="distance_km" min={0} step="any" defaultValue={existing?.distance_km ?? ""} /></label>
        <label className="field">Session RPE<input type="number" name="rpe" min={0} max={10} step={0.5} defaultValue={existing?.rpe ?? ""} /><span className="help">{RPE_HELP}</span></label>
        {planOptions.length > 0 && (
          <label className="field">Fulfils planned session
            <select name="plan_session_id" defaultValue={existing?.plan_session_id ?? ""}>
              <option value="">None</option>
              {planOptions.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
        )}
        <label className="field wide">Notes<textarea name="notes" defaultValue={existing?.notes ?? ""} /></label>
      </div>
      <div className="row"><button className="btn primary" type="submit">{existing ? "Save session" : "Log session"}</button></div>
    </form>
  );
}

import { SPORT_FAMILIES, SPORT_LABEL } from "@/lib/sports";
import type { PlanSession } from "@/lib/domain/plan";
import { deletePlanSession, savePlanSession } from "@/app/(app)/actions";
import { RPE_HELP } from "./session-form";

export function PlanSessionForm({ date, back, existing }: { date: string; back: string; existing?: PlanSession }) {
  return (
    <div className="stack">
      <form action={savePlanSession} className="stack">
        {existing && <input type="hidden" name="id" value={existing.id} />}
        <input type="hidden" name="back" value={back} />
        <div className="form-grid">
          <label className="field">Date<input type="date" name="date" defaultValue={existing?.date ?? date} required /></label>
          <label className="field">Sport
            <select name="sport" defaultValue={existing?.sport ?? "run"}>
              {SPORT_FAMILIES.map((s) => <option key={s} value={s}>{SPORT_LABEL[s]}</option>)}
            </select>
          </label>
          <label className="field">Title<input name="title" defaultValue={existing?.title ?? ""} placeholder="e.g. Threshold intervals" required /></label>
          <label className="field">Intensity<input name="intensity" defaultValue={existing?.intensity ?? ""} placeholder="e.g. Z2, 4×8 min @ LT2" /></label>
          <label className="field">Duration (min)<input type="number" name="planned_duration_min" min={0} step="any" defaultValue={existing?.planned_duration_min ?? ""} /></label>
          <label className="field">Distance (km)<input type="number" name="planned_distance_km" min={0} step="any" defaultValue={existing?.planned_distance_km ?? ""} /></label>
          <label className="field">Target RPE<input type="number" name="planned_rpe" min={0} max={10} step={0.5} defaultValue={existing?.planned_rpe ?? ""} /><span className="help">{RPE_HELP}</span></label>
          <label className="field wide">Description<textarea name="description" defaultValue={existing?.description ?? ""} /></label>
          {existing && (
            <label className="row wide" style={{ fontSize: 13 }}><input type="checkbox" name="skipped" defaultChecked={existing.skipped} /> Skipped (excluded from compliance)</label>
          )}
        </div>
        <div className="row"><button className="btn primary" type="submit">{existing ? "Save session" : "Add to plan"}</button></div>
      </form>
      {existing && (
        <form action={deletePlanSession}>
          <input type="hidden" name="id" value={existing.id} />
          <input type="hidden" name="back" value={back} />
          <button className="btn danger sm" type="submit">Delete “{existing.title}”</button>
        </form>
      )}
    </div>
  );
}

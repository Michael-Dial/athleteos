"use client";
import { useActionState } from "react";
import type { Item } from "@/lib/domain/questionnaire-schema";
import { submitQuestionnaire, type SubmitState } from "@/app/(app)/actions";

/** continueHref: shown as the next step once saved (onboarding uses it to move on). */
export function QuestionnaireForm({ slug, date, items, initial, continueHref, hideDate }: { slug: string; date: string; items: Item[]; initial: Record<string, string>; continueHref?: string; hideDate?: boolean }) {
  const [state, action, pending] = useActionState<SubmitState, FormData>(submitQuestionnaire, { errors: {}, values: initial });
  const v = (k: string) => state.values[k] ?? initial[k] ?? "";
  return (
    <form action={action} className="stack-lg" noValidate>
      <input type="hidden" name="slug" value={slug} />
      {hideDate ? <input type="hidden" name="date" value={date} /> : <label className="field" style={{ maxWidth: 220 }}>Date<input type="date" name="date" defaultValue={date} required /></label>}
      {items.map((it) => {
        const err = state.errors[it.key];
        const id = `q-${it.key}`;
        return (
          <fieldset key={it.key} style={{ border: 0, padding: 0, margin: 0 }} aria-describedby={err ? `${id}-err` : undefined}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>{it.label}{it.required && <span className="muted"> *</span>}</legend>
            {it.help && <p className="small muted" style={{ marginBottom: 6 }}>{it.help}</p>}
            {it.type === "scale" && (
              <>
                <div className="scale" role="radiogroup" aria-label={it.label}>
                  {range(it.min!, it.max!, it.step ?? 1).map((n) => (
                    <label key={n}>
                      <input type="radio" name={`a_${it.key}`} value={n} defaultChecked={v(it.key) === String(n)} />
                      <span>{n}</span>
                    </label>
                  ))}
                </div>
                {(it.lowLabel || it.highLabel) && <div className="anchors" style={{ maxWidth: Math.max(240, (range(it.min!, it.max!, it.step ?? 1).length) * 50) }}><span>{it.lowLabel}</span><span>{it.highLabel}</span></div>}
              </>
            )}
            {it.type === "number" && (
              <div className="row"><input id={id} type="number" name={`a_${it.key}`} min={it.min} max={it.max} step={it.step ?? "any"} defaultValue={v(it.key)} style={{ maxWidth: 160 }} />{it.unit && <span className="muted">{it.unit}</span>}</div>
            )}
            {it.type === "boolean" && (
              <div className="row" style={{ gap: 16 }}>
                <label className="row" style={{ gap: 6 }}><input type="radio" name={`a_${it.key}`} value="true" defaultChecked={v(it.key) === "true"} />Yes</label>
                <label className="row" style={{ gap: 6 }}><input type="radio" name={`a_${it.key}`} value="false" defaultChecked={v(it.key) !== "true"} />No</label>
              </div>
            )}
            {it.type === "choice" && (
              <select id={id} name={`a_${it.key}`} defaultValue={v(it.key)} style={{ maxWidth: 360 }}>
                <option value="">Choose…</option>
                {it.options!.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            )}
            {it.type === "text" && <textarea id={id} name={`a_${it.key}`} defaultValue={v(it.key)} style={{ maxWidth: 640 }} />}
            {err && <p id={`${id}-err`} className="field-error" style={{ marginTop: 4 }}>{err}</p>}
          </fieldset>
        );
      })}
      {state.errors._form && <p className="field-error" role="alert">{state.errors._form}</p>}
      <div className="row">
        {state.saved && continueHref ? (
          <a className="btn primary" href={continueHref}>Continue</a>
        ) : (
          <button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save answers"}</button>
        )}
        {state.saved && <span className="small" role="status" style={{ color: "var(--good)" }}>Saved.</span>}
      </div>
    </form>
  );
}

function range(min: number, max: number, step: number): number[] {
  const out: number[] = [];
  for (let n = min; n <= max + 1e-9 && out.length < 21; n += step) out.push(Number(n.toFixed(4)));
  return out;
}

"use client";
import { useActionState } from "react";
import { saveQuestionnaireDef, type DefState } from "@/app/(app)/actions";

export function DefEditor({ initial }: { initial: string }) {
  const [state, action, pending] = useActionState<DefState, FormData>(saveQuestionnaireDef, { error: null, text: initial });
  return (
    <form action={action} className="stack">
      <label className="field">Definition (JSON)
        <textarea className="code" name="json" defaultValue={state.text} spellCheck={false} aria-invalid={!!state.error} />
      </label>
      {state.error && <pre className="field-error" role="alert" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{state.error}</pre>}
      <div className="row"><button className="btn primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save questionnaire"}</button></div>
    </form>
  );
}

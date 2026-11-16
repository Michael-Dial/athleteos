"use client";
import { useActionState } from "react";
import { createApiToken, type TokenState } from "@/app/(app)/actions";

export function TokenForm() {
  const [state, action, pending] = useActionState<TokenState, FormData>(createApiToken, { token: null, error: null });
  return (
    <div className="stack">
      <form action={action} className="row" style={{ alignItems: "flex-end" }}>
        <label className="field" style={{ flex: 1, maxWidth: 320 }}>Name<input name="name" placeholder="e.g. iPhone, analysis script" required /></label>
        <button className="btn primary" type="submit" disabled={pending}>{pending ? "Creating…" : "Create token"}</button>
      </form>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.token && (
        <div className="notice warn" role="status">
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <b>Copy this token now. It won&apos;t be shown again.</b>
            <code className="mono" style={{ wordBreak: "break-all", userSelect: "all" }}>{state.token}</code>
          </div>
        </div>
      )}
    </div>
  );
}

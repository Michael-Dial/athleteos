"use client";
import { useActionState } from "react";
import { testConnection, type ConnectionTest as TestState } from "@/app/(app)/settings/security-actions";

/** Test the saved settings for one service; the result shows inline, without a reload. */
export function ConnectionTest({ group, configured }: { group: "ow" | "smtp"; configured: boolean }) {
  const [state, action, pending] = useActionState<TestState, FormData>(testConnection, { ok: null, message: "", at: null });
  return (
    <form action={action} className="stack mt" style={{ gap: 6, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <input type="hidden" name="group" value={group} />
      <div className="row between" style={{ alignItems: "center" }}>
        <span className="small ink2">Test the saved settings. No password needed.</span>
        <button className="btn" type="submit" disabled={pending || !configured}>{pending ? "Testing…" : "Test connection"}</button>
      </div>
      {!pending && state.ok !== null && (
        <p className="small" role={state.ok ? "status" : "alert"} style={{ color: state.ok ? "var(--good)" : "var(--bad)", wordBreak: "break-word" }}>
          {state.ok ? "Working. " : "Failed. "}{state.message}
          {state.at && <span className="muted"> · {new Date(state.at).toLocaleTimeString()}</span>}
        </p>
      )}
    </form>
  );
}

"use client";
import { useActionState } from "react";
import { inviteAthlete, type InviteState } from "@/app/(app)/actions";

/** One OW user → a one-time code for the iOS app. The code is shown here once. */
export function InviteButton({ owUserId, label = "Invite" }: { owUserId: string; label?: string }) {
  const [state, action, pending] = useActionState<InviteState, FormData>(inviteAthlete, { invite: null, error: null });
  return (
    <div className="stack" style={{ gap: 6 }}>
      <form action={action}>
        <input type="hidden" name="ow_user_id" value={owUserId} />
        <button className="btn sm" type="submit" disabled={pending}>{pending ? "Creating…" : label}</button>
      </form>
      {state.error && <p className="field-error" role="alert">{state.error}</p>}
      {state.invite && (
        <div className="notice warn" role="status">
          <div className="stack" style={{ gap: 6, minWidth: 0 }}>
            <b>Code for {state.invite.athleteName}. Copy it now; it won&apos;t be shown again.</b>
            <code className="mono" style={{ fontSize: 18, letterSpacing: 1, userSelect: "all" }}>{state.invite.code}</code>
            <span className="small">
              They enter it in the AthleteOS iPhone app, or open <code className="mono" style={{ userSelect: "all" }}>athleteos://invite/{state.invite.code}</code> on the phone.
              Single use, valid until {new Date(state.invite.expiresAt).toLocaleDateString()}. Any earlier unused code for them stops working.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

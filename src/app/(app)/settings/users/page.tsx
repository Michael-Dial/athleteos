import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/current-user";
import { getCtx } from "@/lib/domain/context";
import { fmtDate, localDate } from "@/lib/dates";
import { mailConfigured } from "@/lib/mail";
import { listUsers, type UserRow } from "@/lib/users";
import { searchUsers } from "@/lib/ow/api";
import { owConfig } from "@/lib/ow/client";
import { errorMessage } from "@/lib/domain/errors";
import { Card, Notice } from "@/components/ui";
import { inviteUser } from "./actions";

export const metadata: Metadata = { title: "Users" };

function Status({ u }: { u: UserRow }) {
  if (u.disabled) return <span className="pill flag">Disabled</span>;
  if (!u.has_password) return <span className="pill watch">{u.link_expires_at ? "Invited" : "Invite expired"}</span>;
  return <span className="pill ok">Active</span>;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; removed?: string; q?: string }> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const [users, ctx, mail, ow] = await Promise.all([listUsers(), getCtx(), mailConfigured(), owConfig()]);
  // Search the backend only when asked: it can hold other people's accounts.
  const q = (sp.q ?? "").trim();
  let found: { id: string; label: string; synced: string | null; takenBy: string | null }[] | null = null;
  let searchError: string | null = null;
  if (ow && q.length >= 2) {
    try {
      const taken = new Map(users.filter((x) => x.ow_user_id).map((x) => [x.ow_user_id!, x.name]));
      found = (await searchUsers(q)).slice(0, 20).map((o) => ({
        id: o.id,
        label: [o.first_name, o.last_name].filter(Boolean).join(" ") || o.email || "unnamed",
        synced: o.last_synced_at,
        takenBy: taken.get(o.id) ?? null,
      }));
    } catch (e) {
      searchError = errorMessage(e);
    }
  }
  const day = (iso: string | null) => (iso ? fmtDate(localDate(iso, ctx.settings.timezone), { month: "short", day: "numeric", year: "numeric" }) : "never");
  return (
    <div className="stack-lg">
      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {sp.removed && <p className="small" style={{ color: "var(--good)" }} role="status">{sp.removed} and their data were removed.</p>}
      <Card title="People" className="flush">
        <div className="table-wrap">
          <table className="t">
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Device data</th><th>Last sign-in</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/settings/users/${u.id}`}><b>{u.name}</b></Link>{u.id === me.id && <span className="small muted"> · you</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.role === "admin" ? "Admin" : "Member"}</td>
                  <td><Status u={u} /></td>
                  <td>{u.ow_user_id ? "Linked" : <span className="muted">Not yet</span>}</td>
                  <td>{day(u.last_login_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid cols-2">
        <Card title="Invite someone" hint="they get their own sign-in and their own data">
          <div className="stack">
            {ow && (
              <form method="get" className="row" style={{ alignItems: "flex-end" }}>
                <label className="field" style={{ flex: 1 }}>
                  Existing device-data account (optional)
                  <input name="q" defaultValue={q} minLength={2} placeholder="Search by name or email" />
                  <span className="help">Link it now and their history is there at their first sign-in. Skip it and their first connect creates a new account.</span>
                </label>
                <button className="btn" type="submit">Search</button>
              </form>
            )}
            {searchError && <Notice kind="bad">{searchError}</Notice>}
            <form action={inviteUser} className="stack">
              {found && (found.length === 0 ? <p className="small muted">No accounts match “{q}”.</p> : (
                <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0, gap: 6 }}>
                  <legend className="small" style={{ fontWeight: 600, marginBottom: 4 }}>Link to</legend>
                  {found.map((o) => (
                    <label key={o.id} className="row small" style={{ gap: 8, opacity: o.takenBy ? 0.55 : 1 }}>
                      <input type="radio" name="ow_user_id" value={o.id} disabled={!!o.takenBy} />
                      <span>{o.label} <span className="muted">· {o.takenBy ? `linked to ${o.takenBy}` : `last sync ${day(o.synced)}`}</span></span>
                    </label>
                  ))}
                  <label className="row small" style={{ gap: 8 }}>
                    <input type="radio" name="ow_user_id" value="" defaultChecked /> <span>Don&apos;t link; their first connect creates a new account</span>
                  </label>
                </fieldset>
              ))}
              <label className="field">Name<input name="name" required maxLength={80} autoComplete="off" /></label>
              <label className="field">Email<input name="email" type="email" required autoComplete="off" /></label>
              <label className="field">Role
                <select name="role" defaultValue="member">
                  <option value="member">Member: their own dashboards and connected accounts</option>
                  <option value="admin">Admin: also users, credentials and the data backend</option>
                </select>
              </label>
              <label className="field">Your password<input name="current_password" type="password" autoComplete="current-password" required /></label>
              <p className="small muted">
                They get a one-time invite code (and a link that fills it in){mail ? " by email" : ""}. It expires in 7 days.
                {mail ? " You also see it here, to share another way." : " Email isn't set up, so you'll see it here to pass on yourself."}
              </p>
              <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">Create invite</button></div>
            </form>
          </div>
        </Card>
        <Card title="What admins can do">
          <ul className="small ink2 stack" style={{ margin: 0, paddingLeft: 18 }}>
            <li>Invite, disable and remove people, and change roles.</li>
            <li>Link someone to a device-data account that already has their history. Members can only connect new accounts for themselves.</li>
            <li>Manage credentials and the data backend.</li>
            <li>View anyone&apos;s dashboards, read-only. Members can see this on their Security page.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

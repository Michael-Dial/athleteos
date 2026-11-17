import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/current-user";
import { getCtx } from "@/lib/domain/context";
import { fmtDate, localDate } from "@/lib/dates";
import { mailConfigured } from "@/lib/mail";
import { listUsers, type UserRow } from "@/lib/users";
import { Card, Notice } from "@/components/ui";
import { inviteUser } from "./actions";

export const metadata: Metadata = { title: "Users" };

function Status({ u }: { u: UserRow }) {
  if (u.disabled) return <span className="pill flag">Disabled</span>;
  if (!u.has_password) return <span className="pill watch">{u.link_expires_at ? "Invited" : "Invite expired"}</span>;
  return <span className="pill ok">Active</span>;
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ error?: string; removed?: string }> }) {
  const sp = await searchParams;
  const me = await requireAdmin();
  const [users, ctx, mail] = await Promise.all([listUsers(), getCtx(), mailConfigured()]);
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
          <form action={inviteUser} className="stack">
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
              {mail
                ? "They get an email with a link to set their password. The link works once and expires in 7 days; you also see it here to share another way."
                : "Email isn't set up, so you'll get a link to send them yourself. It works once and expires in 7 days."}
            </p>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn primary" type="submit">Create invite</button></div>
          </form>
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

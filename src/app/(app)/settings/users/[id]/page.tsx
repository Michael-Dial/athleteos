import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/current-user";
import { getCtx } from "@/lib/domain/context";
import { getPhoneCode } from "@/lib/domain/phone-code";
import { errorMessage } from "@/lib/domain/errors";
import { fmtDate, localDate } from "@/lib/dates";
import { getUser, searchUsers } from "@/lib/ow/api";
import { owConfig } from "@/lib/ow/client";
import { q1 } from "@/lib/db";
import { LINK_FLASH_COOKIE, userById } from "@/lib/users";
import { Card, Notice, StatePill } from "@/components/ui";
import { createAndLinkOwUser, linkOwUser, savePhoneCode, unlinkOwUser } from "../../../actions";
import { changeRole, removeUser, sendResetLink, toggleDisabled, viewAs } from "../actions";

export const metadata: Metadata = { title: "User" };

async function attempt<T>(fn: () => Promise<T>): Promise<{ v: T | null; e: string | null }> {
  try { return { v: await fn(), e: null }; } catch (e) { return { v: null, e: errorMessage(e) }; }
}

const DONE: Record<string, string> = {
  linked: "Linked. Their dashboards now show that account's history.",
  unlinked: "Unlinked. Nothing was deleted from the device-data backend.",
  role: "Role changed.",
  enabled: "Enabled. They can sign in again.",
  disabled: "Disabled. They're signed out everywhere and their API tokens stop working.",
  saved: "Pairing code saved. They see it under Connected accounts.",
  cleared: "Pairing code removed.",
};

const MAIL: Record<string, string> = {
  sent: "Emailed to them.",
  notsent: "Email isn't set up, so give them the code (or the link) yourself.",
  failed: "The email couldn't be sent, so give them the code (or the link) yourself.",
};

type SP = Record<string, string | undefined>;

export default async function UserPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const me = await requireAdmin();
  const u = await userById(Number(id));
  if (!u) notFound();
  const ctx = await getCtx();
  const tz = ctx.settings.timezone;
  const day = (iso: string | null | undefined) => (iso ? fmtDate(localDate(iso, tz), { month: "short", day: "numeric", year: "numeric" }) : "never");

  const athlete = (await q1<{ ow_user_id: string | null }>("SELECT ow_user_id FROM athlete WHERE id = $1", [u.athlete_id]))!;
  const cfg = await owConfig();
  const [owUser, phoneCode] = await Promise.all([
    cfg && athlete.ow_user_id ? attempt(() => getUser(athlete.ow_user_id!)) : Promise.resolve({ v: null, e: null }),
    getPhoneCode(u.athlete_id),
  ]);
  const q = (sp.q ?? "").trim();
  // Search only on request: the backend may hold other people's accounts.
  const found = cfg && q.length >= 2 ? await attempt(() => searchUsers(q)) : { v: null, e: null };

  const flash = (await cookies()).get(LINK_FLASH_COOKIE)?.value?.split("|");
  const issued = flash && flash[0] === String(u.id) ? { code: flash[1], url: flash.slice(2).join("|") } : null;
  const linkNote = sp.invited ? MAIL[sp.invited] : sp.linksent ? MAIL[sp.linksent] : null;
  const done = sp.linked ? DONE.linked : sp.unlinked ? DONE.unlinked : sp.role ? DONE.role : sp.status ? DONE[sp.status] : sp.code ? DONE[sp.code] : null;
  const isMe = u.id === me.id;
  const hidden = <input type="hidden" name="user_id" value={u.id} />;
  const owName = (x: { first_name: string | null; last_name: string | null; email: string | null }) => [x.first_name, x.last_name].filter(Boolean).join(" ") || x.email || "unnamed";

  return (
    <div className="stack-lg">
      <div className="row between">
        <div>
          <Link href="/settings/users" className="small">← Users</Link>
          <h2 style={{ margin: "4px 0 0" }}>{u.name}{isMe && <span className="small muted"> · you</span>}</h2>
          <p className="small muted" style={{ margin: 0 }}>{u.email} · {u.role === "admin" ? "Admin" : "Member"}</p>
        </div>
        {!isMe && !u.disabled && <form action={viewAs}>{hidden}<button className="btn" type="submit">View dashboards</button></form>}
      </div>

      {sp.error && <Notice kind="bad">{sp.error}</Notice>}
      {done && <p className="small" style={{ color: "var(--good)" }} role="status">{done}</p>}
      {(sp.invited || sp.linksent) && (
        <Notice kind="info">
          <div className="stack" style={{ gap: 6 }}>
            <span>
              {sp.invited ? `Invite created for ${u.name}` : `New code for ${u.name}`}
              {sp.prelinked ? ", already linked to their existing device-data account" : ""}. {linkNote}
            </span>
            {issued ? (
              <>
                <code className="mono" style={{ userSelect: "all", fontSize: 22, letterSpacing: "0.1em" }}>{issued.code}</code>
                <span className="small">They enter it under &ldquo;Have an invite code?&rdquo; on the sign-in page, or open <code className="mono" style={{ userSelect: "all", wordBreak: "break-all" }}>{issued.url}</code></span>
              </>
            ) : <span className="small muted">The code is only shown right after it&apos;s made. Send a new one if you need it.</span>}
          </div>
        </Notice>
      )}

      <div className="grid cols-2">
        <Card title="Device data" action={<StatePill state={athlete.ow_user_id ? "ok" : "nodata"} label={athlete.ow_user_id ? "Linked" : "Not linked"} />}>
          {!cfg ? (
            <Notice>The data backend isn&apos;t set up yet. <Link href="/settings/credentials">Add it in Credentials</Link>.</Notice>
          ) : (
            <div className="stack">
              {athlete.ow_user_id ? (
                <>
                  <dl className="kv">
                    <dt>Account</dt><dd>{owUser.v ? owName(owUser.v) : owUser.e ?? "—"}</dd>
                    <dt>Id</dt><dd className="mono">{athlete.ow_user_id}</dd>
                    <dt>Last synced</dt><dd>{owUser.v ? `${day(owUser.v.last_synced_at)}${owUser.v.last_synced_provider ? ` · ${owUser.v.last_synced_provider}` : ""}` : "—"}</dd>
                  </dl>
                  <form action={unlinkOwUser}>{hidden}<button className="btn sm" type="submit">Unlink</button></form>
                </>
              ) : (
                <p className="small">Not linked. Their first connect under Connected accounts creates a new, empty account. If they already have history in the backend, link that account here first.</p>
              )}
              <form method="get" className="row" style={{ alignItems: "flex-end" }}>
                <label className="field" style={{ flex: 1 }}>{athlete.ow_user_id ? "Link a different existing account" : "Link an existing account"}<input name="q" defaultValue={q} minLength={2} placeholder="Search by name or email" /></label>
                <button className="btn" type="submit">Search</button>
              </form>
              {found.e && <Notice kind="bad">{found.e}</Notice>}
              {found.v && (found.v.length === 0 ? <p className="small muted">No accounts match “{q}”.</p> : (
                <ul className="stack" style={{ margin: 0, paddingLeft: 0, listStyle: "none" }}>
                  {found.v.slice(0, 20).map((o) => (
                    <li key={o.id} className="row between">
                      <span>{owName(o)} <span className="small muted">· last sync {day(o.last_synced_at)}</span></span>
                      {o.id === athlete.ow_user_id ? <span className="small muted">linked</span> : (
                        <form action={linkOwUser}>{hidden}<input type="hidden" name="ow_user_id" value={o.id} /><button className="btn sm" type="submit">Link to {u.name}</button></form>
                      )}
                    </li>
                  ))}
                </ul>
              ))}
              {!athlete.ow_user_id && (
                <form action={createAndLinkOwUser} className="row" style={{ alignItems: "flex-end" }}>
                  {hidden}
                  <label className="field">First name<input name="first_name" defaultValue={u.name.split(" ")[0]} /></label>
                  <label className="field">Last name<input name="last_name" defaultValue={u.name.split(" ").slice(1).join(" ")} /></label>
                  <button className="btn" type="submit">Create new</button>
                </form>
              )}
            </div>
          )}
        </Card>

        <Card title="Phone pairing code" hint="Apple Health, Health Connect" action={<StatePill state={phoneCode.state === "set" ? "ok" : phoneCode.state === "unreadable" ? "flag" : "nodata"} label={phoneCode.state === "set" ? "Set" : phoneCode.state === "unreadable" ? "Re-enter" : "Not set"} />}>
          <form action={savePhoneCode} className="stack">
            {hidden}
            <label className="field">Pairing code<input name="phone_code" autoComplete="off" spellCheck={false} className="mono" required minLength={4} maxLength={128} /><span className="help">Issued by the backend for {athlete.ow_user_id ? "their linked account" : "their account (link or create it first)"}. They see it under Connected accounts; it&apos;s stored encrypted.</span></label>
            {phoneCode.state === "unreadable" && <Notice kind="bad">The saved code was encrypted under a previous SESSION_SECRET and can&apos;t be read. Paste it again.</Notice>}
            <div className="row">
              <button className="btn primary" type="submit">{phoneCode.state === "none" ? "Save code" : "Replace code"}</button>
              {phoneCode.state !== "none" && <button className="btn" type="submit" name="clear" value="1" formNoValidate>Remove code</button>}
            </div>
          </form>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Sign-in">
          <div className="stack">
            <dl className="kv">
              <dt>Status</dt><dd>{u.disabled ? "Disabled" : u.has_password ? "Active" : "Hasn't set a password yet"}</dd>
              <dt>Emailed codes</dt><dd>{u.login_codes ? "On" : "Off"}</dd>
            </dl>
            <form action={sendResetLink}>{hidden}<button className="btn" type="submit">{u.has_password ? "Send a password reset code" : "Send a new invite code"}</button></form>
            <p className="small muted">A reset code lets them choose a new password; their current one keeps working until they do. Any earlier code stops working.</p>
          </div>
        </Card>
        <Card title="Role">
          <form action={changeRole} className="stack">
            {hidden}
            <label className="field">Role
              <select name="role" defaultValue={u.role}>
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
            </label>
            <label className="field">Your password<input name="current_password" type="password" autoComplete="current-password" required /></label>
            <div className="row" style={{ justifyContent: "flex-end" }}><button className="btn" type="submit">Save role</button></div>
          </form>
        </Card>
      </div>

      {!isMe && (
        <div className="grid cols-2">
          <Card title={u.disabled ? "Enable" : "Disable"}>
            <div className="stack">
              <p className="small ink2">{u.disabled ? "Lets them sign in again. Their data was kept." : "Signs them out everywhere and stops their API tokens. Their data is kept."}</p>
              <form action={toggleDisabled}>{hidden}<button className={`btn${u.disabled ? "" : " danger"}`} type="submit">{u.disabled ? `Enable ${u.name}` : `Disable ${u.name}`}</button></form>
            </div>
          </Card>
          <Card title="Remove">
            <form action={removeUser} className="stack">
              {hidden}
              <p className="small ink2">Deletes {u.name}&apos;s account and everything recorded for them here: plan, check-ins, settings and API tokens. Their device-data account in the backend isn&apos;t touched. This can&apos;t be undone.</p>
              <label className="field">Type {u.email} to confirm<input name="confirm_email" autoComplete="off" required /></label>
              <label className="field">Your password<input name="current_password" type="password" autoComplete="current-password" required /></label>
              <div><button className="btn danger" type="submit">Remove {u.name}</button></div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}

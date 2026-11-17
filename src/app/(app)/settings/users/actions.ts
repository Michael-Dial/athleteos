"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/current-user";
import { VIEW_COOKIE } from "@/lib/domain/context";
import { mailConfigured, sendAccountLink } from "@/lib/mail";
import { confirmPassword } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { LINK_FLASH_COOKIE as FLASH_COOKIE, UserError, bumpSessionEpoch, createUser, deleteUser, issueLink, setDisabled, setRole, userById, type Role, type User } from "@/lib/users";

// Admin-only user management. Anything that creates an account, grants admin
// or deletes data asks for the admin's own password, as credential changes do.


const go = (path: string, q: Record<string, string>) => redirect(`${path}?${new URLSearchParams(q)}`);

function field(fd: FormData, k: string): string {
  const v = fd.get(k);
  return typeof v === "string" ? v.trim() : "";
}

async function confirmAdmin(admin: User, fd: FormData, path: string): Promise<void> {
  const ip = clientIp(await headers());
  if (isLocked(ip)) go(path, { error: "Too many wrong passwords. Wait 15 minutes, then try again." });
  if (!(await confirmPassword(admin, String(fd.get("current_password") ?? "")))) {
    recordFailure(ip);
    go(path, { error: "Your password didn't match, so nothing was changed." });
  }
  clearFailures(ip);
}

async function target(fd: FormData): Promise<User> {
  const u = await userById(Number(fd.get("user_id")));
  if (!u) go("/settings/users", { error: "That user no longer exists." });
  return u!;
}

async function origin(): Promise<string> {
  const h = await headers();
  return `${h.get("x-forwarded-proto") ?? "http"}://${h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3020"}`;
}

/** Issue a link, email it when email works, and hand it to the admin's next page view either way. */
async function deliverLink(admin: User, u: User, kind: "invite" | "reset"): Promise<"sent" | "notsent" | "failed"> {
  const { token, expiresAt } = await issueLink(u.id, kind);
  const url = `${await origin()}/invite/${token}`;
  const secure = (await headers()).get("x-forwarded-proto") === "https";
  (await cookies()).set(FLASH_COOKIE, `${u.id}|${url}`, { httpOnly: true, sameSite: "strict", secure, path: "/settings/users", maxAge: 120 });
  if (!(await mailConfigured())) return "notsent";
  try {
    await sendAccountLink(u.email, {
      kind, url, name: u.name, by: admin.name,
      expires: expiresAt.toUTCString().replace(/:\d\d GMT$/, " UTC"),
    });
    return "sent";
  } catch (e) {
    console.error("account link email failed:", e instanceof Error ? e.message : e);
    return "failed";
  }
}

export async function inviteUser(fd: FormData) {
  const admin = await requireAdmin();
  const path = "/settings/users";
  await confirmAdmin(admin, fd, path);
  const role: Role = field(fd, "role") === "admin" ? "admin" : "member";
  let u: User;
  try {
    u = await createUser(field(fd, "name"), field(fd, "email"), role);
  } catch (e) {
    if (e instanceof UserError) go(path, { error: e.message });
    throw e;
  }
  const mail = await deliverLink(admin, u!, "invite");
  go(`/settings/users/${u!.id}`, { invited: mail });
}

export async function sendResetLink(fd: FormData) {
  const admin = await requireAdmin();
  const u = await target(fd);
  const mail = await deliverLink(admin, u, u.has_password ? "reset" : "invite");
  go(`/settings/users/${u.id}`, { linksent: mail });
}

export async function changeRole(fd: FormData) {
  const admin = await requireAdmin();
  const u = await target(fd);
  const path = `/settings/users/${u.id}`;
  await confirmAdmin(admin, fd, path);
  try {
    await setRole(u, field(fd, "role") === "admin" ? "admin" : "member");
  } catch (e) {
    if (e instanceof UserError) go(path, { error: e.message });
    throw e;
  }
  go(path, { role: "1" });
}

export async function toggleDisabled(fd: FormData) {
  const admin = await requireAdmin();
  const u = await target(fd);
  const path = `/settings/users/${u.id}`;
  if (u.id === admin.id) go(path, { error: "You can't disable your own account." });
  try {
    await setDisabled(u, !u.disabled);
  } catch (e) {
    if (e instanceof UserError) go(path, { error: e.message });
    throw e;
  }
  // Re-enabled users start from a clean slate rather than resuming old sessions.
  if (u.disabled) await bumpSessionEpoch(u.id);
  go(path, { status: u.disabled ? "enabled" : "disabled" });
}

export async function removeUser(fd: FormData) {
  const admin = await requireAdmin();
  const u = await target(fd);
  const path = `/settings/users/${u.id}`;
  if (u.id === admin.id) go(path, { error: "You can't remove your own account." });
  await confirmAdmin(admin, fd, path);
  if (field(fd, "confirm_email").toLowerCase() !== u.email.toLowerCase()) go(path, { error: `Type ${u.email} to confirm removing ${u.name}.` });
  try {
    await deleteUser(u);
  } catch (e) {
    if (e instanceof UserError) go(path, { error: e.message });
    throw e;
  }
  const jar = await cookies();
  if (jar.get(VIEW_COOKIE)?.value === String(u.athlete_id)) jar.delete(VIEW_COOKIE);
  go("/settings/users", { removed: u.name });
}

/** Admin: open another user's dashboards read-only. */
export async function viewAs(fd: FormData) {
  const admin = await requireAdmin();
  const u = await target(fd);
  const jar = await cookies();
  if (u.id === admin.id) jar.delete(VIEW_COOKIE);
  else jar.set(VIEW_COOKIE, String(u.athlete_id), { httpOnly: true, sameSite: "lax", secure: (await headers()).get("x-forwarded-proto") === "https", path: "/" });
  redirect("/");
}

export async function stopViewing() {
  (await cookies()).delete(VIEW_COOKIE);
  redirect("/settings/users");
}

import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_MODE_COOKIE, SESSION_COOKIE, authDisabled } from "./auth";
import { q1 } from "./db";
import { sessionUserId } from "./user-session";
import { userById, type User } from "./users";

/**
 * The signed-in user for this request (pages, server actions). proxy.ts has
 * already turned away requests without a valid session; this resolves who it
 * is. With AUTH_DISABLED (LAN-only installs) it is the first admin.
 */
export const currentUser = cache(async (): Promise<User | null> => {
  if (authDisabled()) {
    let row = await q1<{ id: number }>("SELECT id FROM app_user WHERE role = 'admin' AND disabled_at IS NULL ORDER BY id LIMIT 1");
    // Nobody ever signs in on such an install, so its owner is created here.
    row ??= await q1<{ id: number }>(
      `INSERT INTO app_user (athlete_id, email, role, onboarded_at) SELECT id, 'owner@localhost', 'admin', now() FROM athlete ORDER BY id LIMIT 1
       ON CONFLICT DO NOTHING RETURNING id`);
    return row ? userById(row.id) : null;
  }
  const id = await sessionUserId((await cookies()).get(SESSION_COOKIE)?.value);
  return id === null ? null : userById(id);
});

export async function requireUser(): Promise<User> {
  const u = await currentUser();
  if (!u) redirect("/login");
  return u;
}

/**
 * True while an admin is using the app as a participant: the default, until
 * they switch to Admin in Settings. Admin pages, actions and controls then
 * behave exactly as they do for a member.
 */
export const memberView = cache(async (): Promise<boolean> => {
  const u = await currentUser();
  return u?.role === "admin" && (await cookies()).get(ADMIN_MODE_COOKIE)?.value !== "1";
});

/** Whether to show admin-only controls: an admin who has switched to Admin. */
export async function actsAsAdmin(): Promise<boolean> {
  const u = await currentUser();
  return u?.role === "admin" && !(await memberView());
}

/**
 * An admin in participant view on their own data. Where a participant would
 * read "your admin needs to set this up", that admin is told to switch
 * instead; while viewing someone else they see exactly what that person sees.
 */
export async function switchToAdminHint(viewingSomeone: boolean): Promise<boolean> {
  return !viewingSomeone && (await currentUser())?.role === "admin" && (await memberView());
}

/** Admin-only pages and actions. Members (and an admin seeing the app as one) get a plain 404, so admin features don't announce themselves. */
export async function requireAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin" || (await memberView())) notFound();
  return u;
}

/** The admin role itself, ignoring the Participant/Admin switch: only for flipping that switch. */
export async function requireRealAdmin(): Promise<User> {
  const u = await requireUser();
  if (u.role !== "admin") notFound();
  return u;
}

import "server-only";
import { q1 } from "./db";
import { owConfigured } from "./ow/client";
import { deleteOwUser } from "./ow/api";
import { UserError, deleteUser, isLastAdmin, type User } from "./users";

// A person deleting their own account (Settings → Security on the web, More →
// Delete account in the app; the App Store requires the second). Unlike an
// admin removing someone, this also deletes their device-data account, because
// that history is theirs and they asked for it to go. The backend is deleted
// first: if it can't be reached nothing is removed, so a retry finishes the job
// instead of leaving device data nobody can reach or delete.
export async function deleteOwnAccount(user: User): Promise<void> {
  // Checked before anything is deleted, so a refusal leaves the device data too.
  if (await isLastAdmin(user)) throw new UserError("You're the only admin, so your account can't be deleted yet. Make someone else an admin under Settings → Users first.");
  const row = await q1<{ ow_user_id: string | null }>("SELECT ow_user_id FROM athlete WHERE id = $1", [user.athlete_id]);
  if (row?.ow_user_id && (await owConfigured())) await deleteOwUser(row.ow_user_id);
  await deleteUser(user);
}

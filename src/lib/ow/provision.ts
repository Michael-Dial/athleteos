import "server-only";
import { tx } from "../db";
import type { Athlete } from "../domain/context";
import { invalidate } from "../cache";
import { createUser } from "./api";

/** "Ada King Lovelace" → first "Ada", last "King Lovelace". */
export function splitName(name: string): { first: string; last: string } {
  const t = name.trim().replace(/\s+/g, " ");
  const i = t.indexOf(" ");
  return i < 0 ? { first: t, last: "" } : { first: t.slice(0, i), last: t.slice(i + 1) };
}

/**
 * The athlete's device-data user, created on first use so connecting an
 * account is one click and the backend never shows. The row lock serialises
 * two concurrent first connects; without it each would create a user and one
 * would be orphaned in the backend. An athlete who already has a backend user
 * with history should be linked under Settings → Data backend before their
 * first connect, or this creates an empty second user.
 */
export async function ensureOwUser(athlete: Athlete): Promise<string> {
  if (athlete.ow_user_id) return athlete.ow_user_id;
  const id = await tx(async (c) => {
    const row = (await c.query<{ name: string; ow_user_id: string | null }>("SELECT name, ow_user_id FROM athlete WHERE id = $1 FOR UPDATE", [athlete.id])).rows[0];
    if (!row) throw new Error(`athlete ${athlete.id} not found`);
    if (row.ow_user_id) return row.ow_user_id;
    const { first, last } = splitName(row.name);
    const u = await createUser(first, last);
    await c.query("UPDATE athlete SET ow_user_id = $1 WHERE id = $2", [u.id, athlete.id]);
    return u.id;
  });
  invalidate("ow:");
  return id;
}

import "server-only";
import { q, tx, seedAthlete } from "./db";
import { issueToken } from "./api/tokens";
import { getUser } from "./ow/api";
import { hashInviteCode, newInviteCode, normalizeInviteCode } from "./invite-code";

export const INVITE_DAYS = 7;

export interface InviteCreated {
  code: string;
  athleteId: number;
  athleteName: string;
  expiresAt: string;
  newAthlete: boolean;
}

/**
 * An invite for whoever owns this OW user. The athlete row is found by its OW
 * user, or created (with the default questionnaires) when there is none, so
 * an invited athlete reads exactly the OW user the admin picked and no other.
 * Issuing a new code revokes that athlete's unused ones: only the latest code
 * the admin handed out works.
 */
export async function createInvite(owUserId: string): Promise<InviteCreated> {
  // Fails here, before anything is written, if the OW user doesn't exist.
  const u = await getUser(owUserId);
  const fallbackName = [u.first_name, u.last_name].filter(Boolean).join(" ") || u.email || "Athlete";
  const code = newInviteCode();
  return tx(async (c) => {
    let row = (await c.query<{ id: number; name: string }>("SELECT id, name FROM athlete WHERE ow_user_id = $1 FOR UPDATE", [owUserId])).rows[0];
    const newAthlete = !row;
    if (!row) {
      row = (await c.query<{ id: number; name: string }>("INSERT INTO athlete (name, ow_user_id) VALUES ($1, $2) RETURNING id, name", [fallbackName, owUserId])).rows[0];
      await seedAthlete(c, row.id);
    }
    await c.query("UPDATE invite SET revoked_at = now() WHERE athlete_id = $1 AND redeemed_at IS NULL AND revoked_at IS NULL", [row.id]);
    const ins = await c.query<{ expires_at: Date }>(
      `INSERT INTO invite (athlete_id, code_hash, expires_at) VALUES ($1, $2, now() + make_interval(days => $3)) RETURNING expires_at`,
      [row.id, hashInviteCode(code), INVITE_DAYS],
    );
    return { code, athleteId: row.id, athleteName: row.name, expiresAt: new Date(ins.rows[0].expires_at).toISOString(), newAthlete };
  });
}

export type RedeemResult =
  | { ok: true; token: string; tokenId: number; tokenName: string; createdAt: string; athlete: { id: number; name: string } }
  | { ok: false; reason: "malformed" | "invalid" };

/**
 * Exchange a code for an API token for its athlete. Used, expired, revoked and
 * unknown codes all answer "invalid" so the response says nothing about which
 * codes exist. The UPDATE … RETURNING makes a code single-use under races.
 */
export async function redeemInvite(input: string, deviceName: string): Promise<RedeemResult> {
  const code = normalizeInviteCode(input);
  if (!code) return { ok: false, reason: "malformed" };
  return tx(async (c) => {
    const inv = (await c.query<{ id: number; athlete_id: number }>(
      `UPDATE invite SET redeemed_at = now()
       WHERE code_hash = $1 AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
       RETURNING id, athlete_id`, [hashInviteCode(code)])).rows[0];
    if (!inv) return { ok: false, reason: "invalid" } as const;
    const { token, row } = await issueToken(inv.athlete_id, deviceName, c);
    await c.query("UPDATE invite SET token_id = $1 WHERE id = $2", [row.id, inv.id]);
    const a = (await c.query<{ id: number; name: string }>("SELECT id, name FROM athlete WHERE id = $1", [inv.athlete_id])).rows[0];
    return { ok: true, token, tokenId: row.id, tokenName: row.name, createdAt: new Date(row.created_at).toISOString(), athlete: a } as const;
  });
}

export async function revokeInvite(id: number): Promise<void> {
  await q("UPDATE invite SET revoked_at = now() WHERE id = $1 AND redeemed_at IS NULL AND revoked_at IS NULL", [id]);
}

export interface AthleteRow {
  id: number;
  name: string;
  ow_user_id: string | null;
  devices: number;
  pending_invite_id: number | null;
  pending_expires_at: string | null;
}

/** Every athlete with how many app tokens they hold and their open invite, if any. */
export async function listAthletes(): Promise<AthleteRow[]> {
  return q<AthleteRow>(`
    SELECT a.id, a.name, a.ow_user_id,
      (SELECT count(*)::int FROM api_token t WHERE t.athlete_id = a.id AND t.revoked_at IS NULL) AS devices,
      i.id AS pending_invite_id, i.expires_at AS pending_expires_at
    FROM athlete a
    LEFT JOIN LATERAL (
      SELECT id, expires_at FROM invite
      WHERE athlete_id = a.id AND redeemed_at IS NULL AND revoked_at IS NULL AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1
    ) i ON true
    ORDER BY a.id`);
}

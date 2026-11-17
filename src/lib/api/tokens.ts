import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { PoolClient } from "pg";
import { q, q1 } from "../db";

export interface ApiTokenRow {
  id: number;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
}

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

/** New token for an athlete. The plaintext is returned once and never stored. */
export async function issueToken(athleteId: number, name: string, client?: PoolClient): Promise<{ token: string; row: ApiTokenRow }> {
  const token = `aos_${randomBytes(32).toString("base64url")}`;
  // Inside a caller's transaction (invite redemption) when a client is given.
  const run = async (sql: string, params: unknown[]) => client ? (await client.query<ApiTokenRow>(sql, params)).rows[0] ?? null : q1<ApiTokenRow>(sql, params);
  const row = await run(
    `INSERT INTO api_token (athlete_id, name, token_hash, prefix) VALUES ($1,$2,$3,$4)
     RETURNING id, name, prefix, created_at, last_used_at`,
    [athleteId, name.trim().slice(0, 80) || "Unnamed", hash(token), token.slice(0, 12)],
  );
  return { token, row: row! };
}

/** Resolve a bearer token to its athlete; null if unknown or revoked. */
export async function resolveToken(token: string): Promise<{ athleteId: number; tokenId: number } | null> {
  if (!token.startsWith("aos_") || token.length > 200) return null;
  const row = await q1<{ id: number; athlete_id: number; stale: boolean }>(
    `SELECT id, athlete_id, (last_used_at IS NULL OR last_used_at < now() - interval '5 minutes') AS stale
     FROM api_token WHERE token_hash = $1 AND revoked_at IS NULL`,
    [hash(token)],
  );
  if (!row) return null;
  // Only touch last_used_at every few minutes so reads don't each cause a write.
  if (row.stale) await q("UPDATE api_token SET last_used_at = now() WHERE id = $1", [row.id]);
  return { athleteId: row.athlete_id, tokenId: row.id };
}

export async function listTokens(athleteId: number): Promise<ApiTokenRow[]> {
  return q<ApiTokenRow>(
    "SELECT id, name, prefix, created_at, last_used_at FROM api_token WHERE athlete_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC",
    [athleteId],
  );
}

export async function revokeToken(athleteId: number, id: number): Promise<boolean> {
  const row = await q1("UPDATE api_token SET revoked_at = now() WHERE id = $1 AND athlete_id = $2 AND revoked_at IS NULL RETURNING id", [id, athleteId]);
  return !!row;
}

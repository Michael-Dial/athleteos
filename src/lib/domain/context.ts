import "server-only";
import { cache } from "react";
import { q1 } from "../db";
import { getSettings, type Settings } from "../settings";
import { owConfigured } from "../ow/client";
import type { OwCtx } from "../ow/api";

export interface Athlete {
  id: number;
  name: string;
  ow_user_id: string | null;
}

export interface AppCtx {
  athlete: Athlete;
  settings: Settings;
  /** Null when OW is not configured or the athlete is not linked to an OW user yet. */
  ow: OwCtx | null;
  owConfigured: boolean;
}

// Web session: single-user today, so the first athlete. API tokens carry their
// own athlete_id (loadCtx), which is the path family mode will use.
export const getCtx = cache(async (): Promise<AppCtx> => {
  const athlete = await q1<Athlete>("SELECT id, name, ow_user_id FROM athlete ORDER BY id LIMIT 1");
  if (!athlete) throw new Error("No athlete row; database seed did not run");
  return build(athlete);
});

export const loadCtx = cache(async (athleteId: number): Promise<AppCtx> => {
  const athlete = await q1<Athlete>("SELECT id, name, ow_user_id FROM athlete WHERE id = $1", [athleteId]);
  if (!athlete) throw new Error(`athlete ${athleteId} not found`);
  return build(athlete);
});

async function build(athlete: Athlete): Promise<AppCtx> {
  const settings = await getSettings(athlete.id);
  const configured = await owConfigured();
  const ow: OwCtx | null =
    configured && athlete.ow_user_id
      ? { userId: athlete.ow_user_id, includeRedundantRelays: settings.ow.includeRedundantRelays, ttl: settings.ow.cacheTtlSeconds, historicalTtl: settings.ow.historicalCacheTtlSeconds }
      : null;
  return { athlete, settings, ow, owConfigured: configured };
}

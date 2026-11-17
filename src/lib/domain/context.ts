import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { q1 } from "../db";
import { requireUser } from "../current-user";
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
  /**
   * Set when an admin is looking at another user's dashboards. Pages render
   * that athlete; every write refuses, so viewing can't change their data.
   */
  viewing: { userName: string } | null;
}

export const VIEW_COOKIE = "aos_view";

// Web pages and actions: the signed-in user's athlete, or for an admin the
// athlete chosen under Settings → Users → View dashboards. API tokens carry
// their own athlete (loadCtx).
export const getCtx = cache(async (): Promise<AppCtx> => {
  const user = await requireUser();
  let athleteId = user.athlete_id;
  let viewing: AppCtx["viewing"] = null;
  const view = Number((await cookies()).get(VIEW_COOKIE)?.value);
  if (user.role === "admin" && Number.isInteger(view) && view !== user.athlete_id) {
    const other = await q1<{ name: string }>("SELECT a.name FROM athlete a JOIN app_user u ON u.athlete_id = a.id WHERE a.id = $1", [view]);
    if (other) { athleteId = view; viewing = { userName: other.name }; }
  }
  const athlete = await q1<Athlete>("SELECT id, name, ow_user_id FROM athlete WHERE id = $1", [athleteId]);
  if (!athlete) throw new Error(`athlete ${athleteId} not found`);
  return { ...(await build(athlete)), viewing };
});

export const loadCtx = cache(async (athleteId: number): Promise<AppCtx> => {
  const athlete = await q1<Athlete>("SELECT id, name, ow_user_id FROM athlete WHERE id = $1", [athleteId]);
  if (!athlete) throw new Error(`athlete ${athleteId} not found`);
  return { ...(await build(athlete)), viewing: null };
});

async function build(athlete: Athlete): Promise<Omit<AppCtx, "viewing">> {
  const settings = await getSettings(athlete.id);
  const configured = await owConfigured();
  const ow: OwCtx | null =
    configured && athlete.ow_user_id
      ? { userId: athlete.ow_user_id, includeRedundantRelays: settings.ow.includeRedundantRelays, ttl: settings.ow.cacheTtlSeconds, historicalTtl: settings.ow.historicalCacheTtlSeconds }
      : null;
  return { athlete, settings, ow, owConfigured: configured };
}

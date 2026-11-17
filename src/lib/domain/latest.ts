import "server-only";
import type { AppCtx } from "./context";
import { getDevices } from "../ow/api";
import { localDate, type ISODate } from "../dates";

/**
 * The athlete's most recent day with any device data, from the device list's
 * last-seen times. Empty windows use it to point at where data actually is
 * instead of a dead-end "no data". Null when nothing has reported or the
 * backend can't be reached (the page shows its own backend error then).
 */
export async function latestDeviceDay(ctx: AppCtx): Promise<ISODate | null> {
  if (!ctx.ow) return null;
  try {
    const seen = (await getDevices(ctx.ow)).map((d) => d.last_seen_at).filter((v): v is string => !!v).sort();
    return seen.length ? localDate(seen[seen.length - 1], ctx.settings.timezone) : null;
  } catch {
    return null;
  }
}

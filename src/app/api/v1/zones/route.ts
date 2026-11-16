import { apiRoute, query, window } from "@/lib/api/http";
import { ZonesQuery } from "@/lib/api/schemas";
import { getZoneReport } from "@/lib/domain/zone-report";

// One series request per recording: the window is capped to keep a cold call bounded.
export const GET = apiRoute(async ({ req, ctx }) => {
  const q = query(req, ZonesQuery);
  const w = window(ctx, q, 84, 371);
  return getZoneReport(ctx, q.metric, w.start, w.end, q.metric === "hr" ? q.sport : "all");
});

import { apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { getNightly } from "@/lib/domain/nightly";
import { nightDto } from "@/lib/api/dto";

// One row per (night, device): never merged, so clients can compare devices.
export const GET = apiRoute(async ({ req, ctx }) => {
  const w = window(ctx, query(req, WindowQuery), 30, 366);
  const n = await getNightly(ctx, w.start, w.end);
  return { ...w, nights: n.rows.filter((r) => r.date >= w.start).map(nightDto), owError: n.owError };
});

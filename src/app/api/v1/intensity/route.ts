import { apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { getIntensity } from "@/lib/domain/intensity";

// One HR request per session: the window is capped to keep a cold call bounded.
export const GET = apiRoute(async ({ req, ctx }) => {
  const w = window(ctx, query(req, WindowQuery), 56, 182);
  return getIntensity(ctx, w.start, w.end);
});

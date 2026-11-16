import { apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { planWindow } from "@/lib/api/plan";

export const GET = apiRoute(async ({ req, ctx }) => {
  const w = window(ctx, query(req, WindowQuery), 28, 400);
  return { ...w, ...(await planWindow(ctx, w.start, w.end)) };
});

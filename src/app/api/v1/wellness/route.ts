import { apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { listWellness } from "@/lib/domain/questionnaires";
import { wellnessDto } from "@/lib/api/dto";

export const GET = apiRoute(async ({ req, ctx }) => {
  const w = window(ctx, query(req, WindowQuery), 90, 1100);
  return { ...w, days: (await listWellness(ctx.athlete.id, w.start, w.end)).map(wellnessDto) };
});

import { ApiError, apiRoute, query, window, WindowQuery } from "@/lib/api/http";
import { getDef, listResponses } from "@/lib/domain/questionnaires";
import { responseDto } from "@/lib/api/dto";

export const GET = apiRoute<{ slug: string }>(async ({ req, ctx, params }) => {
  const d = await getDef(ctx.athlete.id, params.slug);
  if (!d) throw new ApiError(404, "not_found", "questionnaire not found");
  const w = window(ctx, query(req, WindowQuery), 90, 1100);
  return { ...w, responses: (await listResponses(ctx.athlete.id, d.id, w.start, w.end)).map(responseDto) };
});

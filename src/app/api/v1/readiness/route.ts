import { apiRoute, query } from "@/lib/api/http";
import { ReadinessQuery } from "@/lib/api/schemas";
import { getReadiness } from "@/lib/domain/readiness";
import { readinessDto } from "@/lib/api/dto";
import { todayIn } from "@/lib/dates";

export const GET = apiRoute(async ({ req, ctx }) => {
  const qy = query(req, ReadinessQuery);
  const date = qy.date ?? todayIn(ctx.settings.timezone);
  return readinessDto(await getReadiness(ctx, date, { historyDays: qy.days }), true);
});

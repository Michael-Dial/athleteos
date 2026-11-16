import { apiRoute, body } from "@/lib/api/http";
import { CopyWeekInput } from "@/lib/domain/inputs";
import { copyPlanWeek } from "@/lib/domain/writes";

export const POST = apiRoute(async ({ req, ctx }) => {
  const c = await body(req, CopyWeekInput);
  return { created: await copyPlanWeek(ctx.athlete.id, c.weekStart, c.weeks) };
});

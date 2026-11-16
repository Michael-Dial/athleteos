import { ApiError, apiRoute, query } from "@/lib/api/http";
import { ReviewQuery } from "@/lib/api/schemas";
import { getWeeklyReview } from "@/lib/domain/review";
import { startOfWeek, todayIn } from "@/lib/dates";

export const GET = apiRoute(async ({ req, ctx }) => {
  const today = todayIn(ctx.settings.timezone);
  const week = startOfWeek(query(req, ReviewQuery).week ?? today);
  if (week > startOfWeek(today)) throw new ApiError(400, "future_week", "week is in the future");
  return getWeeklyReview(ctx, week);
});

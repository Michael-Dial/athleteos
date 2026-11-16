import { ApiError, apiRoute, body, DateParam } from "@/lib/api/http";
import { getDef, getResponse, submitResponse } from "@/lib/domain/questionnaires";
import { validateAnswers } from "@/lib/domain/questionnaire-schema";
import { responseDto } from "@/lib/api/dto";
import { AnswersBody } from "@/lib/api/schemas";
import { todayIn } from "@/lib/dates";

// Idempotent: answering the same date again replaces the earlier answers.
export const PUT = apiRoute<{ slug: string; date: string }>(async ({ req, ctx, params }) => {
  const date = DateParam.parse(params.date);
  if (date > todayIn(ctx.settings.timezone)) throw new ApiError(400, "future_date", "cannot answer for a future date");
  const d = await getDef(ctx.athlete.id, params.slug);
  if (!d) throw new ApiError(404, "not_found", "questionnaire not found");
  if (!d.active) throw new ApiError(409, "inactive", "questionnaire is inactive");
  const { answers, errors } = validateAnswers(d.items, (await body(req, AnswersBody)).answers);
  if (Object.keys(errors).length) {
    throw new ApiError(422, "validation_failed", "Some answers did not validate", Object.entries(errors).map(([path, message]) => ({ path: `answers.${path}`, message })));
  }
  await submitResponse(ctx.athlete.id, d, date, answers);
  return responseDto((await getResponse(d.id, date))!);
});

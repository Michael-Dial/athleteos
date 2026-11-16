import { apiRoute, body, intParam, noContent } from "@/lib/api/http";
import { PlanSessionInput } from "@/lib/domain/inputs";
import { deletePlanSession, updatePlanSession } from "@/lib/domain/writes";

export const PUT = apiRoute<{ id: string }>(async ({ req, ctx, params }) => {
  await updatePlanSession(ctx.athlete.id, intParam(params.id, "id"), await body(req, PlanSessionInput));
  return noContent();
});

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, params }) => {
  await deletePlanSession(ctx.athlete.id, intParam(params.id, "id"));
  return noContent();
});

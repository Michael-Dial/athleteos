import { apiRoute, body, intParam, noContent } from "@/lib/api/http";
import { PhaseInput } from "@/lib/domain/inputs";
import { deletePhase, updatePhase } from "@/lib/domain/writes";

export const PUT = apiRoute<{ id: string }>(async ({ req, ctx, params }) => {
  await updatePhase(ctx.athlete.id, intParam(params.id, "id"), await body(req, PhaseInput));
  return noContent();
});

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, params }) => {
  await deletePhase(ctx.athlete.id, intParam(params.id, "id"));
  return noContent();
});

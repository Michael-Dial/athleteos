import { apiRoute, body, intParam, noContent } from "@/lib/api/http";
import { ManualSessionInput } from "@/lib/domain/inputs";
import { deleteManualSession, updateManualSession } from "@/lib/domain/writes";

export const PUT = apiRoute<{ id: string }>(async ({ req, ctx, params }) => {
  await updateManualSession(ctx.athlete.id, intParam(params.id, "id"), await body(req, ManualSessionInput));
  return noContent();
});

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, params }) => {
  await deleteManualSession(ctx.athlete.id, intParam(params.id, "id"));
  return noContent();
});

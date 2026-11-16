import { apiRoute, body, noContent } from "@/lib/api/http";
import { AnnotationPatch } from "@/lib/api/schemas";
import { upsertAnnotation } from "@/lib/domain/writes";

// Partial update: omitted fields keep their stored value; null clears.
export const PATCH = apiRoute<{ owWorkoutId: string }>(async ({ req, ctx, params }) => {
  const a = await body(req, AnnotationPatch);
  await upsertAnnotation(ctx.athlete.id, { ...a, owWorkoutId: decodeURIComponent(params.owWorkoutId) });
  return noContent();
});

import { ApiError, apiRoute, body } from "@/lib/api/http";
import { DefSchema } from "@/lib/domain/questionnaire-schema";
import { getDef, upsertDef } from "@/lib/domain/questionnaires";
import { questionnaireDto } from "@/lib/api/dto";

export const GET = apiRoute<{ slug: string }>(async ({ ctx, params }) => {
  const d = await getDef(ctx.athlete.id, params.slug);
  if (!d) throw new ApiError(404, "not_found", "questionnaire not found");
  return questionnaireDto(d);
});

// Create or replace a definition. Changing items bumps its version; past
// responses keep the items they were answered against.
export const PUT = apiRoute<{ slug: string }>(async ({ req, ctx, params }) => {
  const d = await body(req, DefSchema);
  if (d.slug !== params.slug) throw new ApiError(400, "slug_mismatch", "slug in the body must match the URL");
  return questionnaireDto(await upsertDef(ctx.athlete.id, d, true));
});

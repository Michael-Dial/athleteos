import { ApiError, apiRoute, intParam, noContent } from "@/lib/api/http";
import { revokeToken } from "@/lib/api/tokens";

export const DELETE = apiRoute<{ id: string }>(async ({ ctx, params }) => {
  if (!(await revokeToken(ctx.athlete.id, intParam(params.id, "id")))) throw new ApiError(404, "not_found", "token not found");
  return noContent();
});

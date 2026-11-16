import { apiRoute, query } from "@/lib/api/http";
import { IllnessQuery } from "@/lib/api/schemas";
import { getIllness } from "@/lib/domain/illness";

export const GET = apiRoute(async ({ req, ctx }) => {
  const q = query(req, IllnessQuery);
  return getIllness(ctx, q.date, q.days);
});

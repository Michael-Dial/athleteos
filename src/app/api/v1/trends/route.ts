import { apiRoute, query } from "@/lib/api/http";
import { TrendsQuery } from "@/lib/api/schemas";
import { getTrends } from "@/lib/domain/trends";

export const GET = apiRoute(async ({ req, ctx }) => getTrends(ctx, query(req, TrendsQuery).weeks));

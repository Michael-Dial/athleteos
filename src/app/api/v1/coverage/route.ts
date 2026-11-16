import { apiRoute, query } from "@/lib/api/http";
import { CoverageQuery } from "@/lib/api/schemas";
import { getCoverage } from "@/lib/domain/coverage";

export const GET = apiRoute(async ({ req, ctx }) => getCoverage(ctx, query(req, CoverageQuery).days));

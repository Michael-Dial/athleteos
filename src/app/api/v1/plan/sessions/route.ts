import { apiRoute, body, json } from "@/lib/api/http";
import { PlanSessionInput } from "@/lib/domain/inputs";
import { createPlanSession } from "@/lib/domain/writes";

export const POST = apiRoute(async ({ req, ctx }) => json({ id: await createPlanSession(ctx.athlete.id, await body(req, PlanSessionInput)) }, 201));

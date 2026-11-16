import { apiRoute, body, json } from "@/lib/api/http";
import { PhaseInput } from "@/lib/domain/inputs";
import { createPhase } from "@/lib/domain/writes";
import { listAllPhases } from "@/lib/domain/plan";
import { phaseDto } from "@/lib/api/dto";

export const GET = apiRoute(async ({ ctx }) => ({ phases: (await listAllPhases(ctx.athlete.id)).map(phaseDto) }));

export const POST = apiRoute(async ({ req, ctx }) => json({ id: await createPhase(ctx.athlete.id, await body(req, PhaseInput)) }, 201));

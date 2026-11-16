import { apiRoute, body, json } from "@/lib/api/http";
import { ManualSessionInput } from "@/lib/domain/inputs";
import { createManualSession } from "@/lib/domain/writes";

export const POST = apiRoute(async ({ req, ctx }) => {
  const id = await createManualSession(ctx.athlete.id, await body(req, ManualSessionInput));
  return json({ id, key: `manual:${id}` }, 201);
});

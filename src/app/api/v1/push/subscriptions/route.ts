import { ApiError, apiRoute, body, noContent, query } from "@/lib/api/http";
import { EndpointQuery, PushSubscriptionBody } from "@/lib/api/schemas";
import { deleteSubscription, saveSubscription } from "@/lib/push/webpush";

export const POST = apiRoute(async ({ req, ctx }) => {
  await saveSubscription(ctx.athlete.id, await body(req, PushSubscriptionBody), req.headers.get("user-agent"));
  return noContent();
});

export const DELETE = apiRoute(async ({ req, ctx }) => {
  if (!(await deleteSubscription(ctx.athlete.id, query(req, EndpointQuery).endpoint))) throw new ApiError(404, "not_found", "subscription not found");
  return noContent();
});

import { ApiError, apiRoute } from "@/lib/api/http";
import { sendToAthlete } from "@/lib/push/webpush";

export const POST = apiRoute(async ({ ctx }) => {
  const r = await sendToAthlete(ctx.athlete.id, { title: "AthleteOS", body: "Notifications are working.", url: "/", tag: "test" });
  if (r.sent + r.failed === 0) throw new ApiError(409, "no_subscriptions", "Enable notifications on a device first");
  return r;
});

import { apiRoute } from "@/lib/api/http";
import { todayIn } from "@/lib/dates";

export const GET = apiRoute(async ({ ctx, auth }) => ({
  athlete: { id: ctx.athlete.id, name: ctx.athlete.name },
  timezone: ctx.settings.timezone,
  today: todayIn(ctx.settings.timezone),
  openWearables: { configured: ctx.owConfigured, linked: !!ctx.ow },
  auth,
}));

import { apiRoute } from "@/lib/api/http";
import { todayIn } from "@/lib/dates";

export const GET = apiRoute(async ({ ctx, auth, user }) => ({
  user: { id: user.id, email: user.email, role: user.role, onboarded: user.onboarded },
  athlete: { id: ctx.athlete.id, name: ctx.athlete.name },
  timezone: ctx.settings.timezone,
  today: todayIn(ctx.settings.timezone),
  openWearables: { configured: ctx.owConfigured, linked: !!ctx.ow },
  auth,
}));

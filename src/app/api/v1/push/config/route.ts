import { apiRoute } from "@/lib/api/http";
import { countSubscriptions, vapidKeys } from "@/lib/push/webpush";

// What a browser needs to subscribe, plus the current reminder settings.
export const GET = apiRoute(async ({ ctx }) => ({
  publicKey: (await vapidKeys()).publicKey,
  subscriptions: await countSubscriptions(ctx.athlete.id),
  reminders: ctx.settings.reminders,
}));

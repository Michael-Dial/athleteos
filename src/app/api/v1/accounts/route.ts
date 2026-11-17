import { ApiError, apiRoute } from "@/lib/api/http";
import { accountsView } from "@/lib/domain/accounts";

// The athlete's connected accounts: which services they can connect and the
// accounts they hold, by brand. Backs the app's Accounts screen.
export const GET = apiRoute(async ({ ctx }) => {
  if (!ctx.owConfigured) throw new ApiError(503, "not_configured", "Device data isn't set up on this server yet");
  return accountsView(ctx);
});

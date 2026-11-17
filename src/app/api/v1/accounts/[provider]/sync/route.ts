import { ApiError, apiRoute } from "@/lib/api/http";
import { syncProvider } from "@/lib/ow/api";
import { invalidate } from "@/lib/cache";
import { errorMessage } from "@/lib/domain/errors";

// Ask a cloud provider for new data now instead of waiting for its schedule.
export const POST = apiRoute<{ provider: string }>(async ({ ctx, params }) => {
  if (!ctx.ow) throw new ApiError(409, "not_connected", "No device account is connected yet");
  if (!/^[a-z0-9_-]{1,40}$/.test(params.provider)) throw new ApiError(404, "unknown_provider", "No such service");
  try {
    await syncProvider(ctx.ow, params.provider);
  } catch (e) {
    throw new ApiError(502, "sync_failed", errorMessage(e));
  }
  invalidate(`ow:${ctx.ow.userId}`);
  return { requested: true };
});

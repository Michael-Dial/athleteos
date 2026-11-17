import { ApiError, apiRoute } from "@/lib/api/http";
import { ensureOwUser } from "@/lib/ow/provision";
import { mintSdkToken } from "@/lib/ow/api";
import { errorMessage } from "@/lib/domain/errors";

// The phone's health-store sync (Apple Health) runs OW's SDK. Its tokens are
// minted here for the caller's own athlete, so no backend credential ships in
// the app and an athlete can only ever write to their own OW user. The SDK
// talks to OW through this server's /ow proxy (syncPath), since OW itself is
// not reachable from the internet.
export const POST = apiRoute(async ({ ctx }) => {
  if (!ctx.owConfigured) throw new ApiError(503, "not_configured", "Device data isn't set up on this server yet");
  try {
    const owUserId = await ensureOwUser(ctx.athlete);
    const t = await mintSdkToken(owUserId);
    return { owUserId, accessToken: t.accessToken, refreshToken: t.refreshToken, expiresIn: t.expiresIn, syncPath: "/ow" };
  } catch (e) {
    throw new ApiError(502, "phone_sync_unavailable", errorMessage(e));
  }
});

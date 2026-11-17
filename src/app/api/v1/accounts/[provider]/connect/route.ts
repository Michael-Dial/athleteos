import { ApiError, apiRoute, body } from "@/lib/api/http";
import { ConnectBody } from "@/lib/api/schemas";
import { authorizeUrl } from "@/lib/ow/api";
import { ensureOwUser } from "@/lib/ow/provision";
import { oauthReturn } from "@/lib/domain/accounts";
import { errorMessage } from "@/lib/domain/errors";
import { publicUrl } from "@/lib/http";

// Starts a provider's OAuth for the caller. The app opens authorizationUrl in
// a web authentication session, which returns on athleteos://accounts/connected.
export const POST = apiRoute<{ provider: string }>(async ({ req, ctx, params }) => {
  if (!ctx.owConfigured) throw new ApiError(503, "not_configured", "Device data isn't set up on this server yet");
  const b = await body(req, ConnectBody);
  if (!/^[a-z0-9_-]{1,40}$/.test(params.provider)) throw new ApiError(404, "unknown_provider", "No such service");
  try {
    const userId = await ensureOwUser(ctx.athlete);
    const origin = publicUrl(req.headers, req.nextUrl, "/").origin;
    return { authorizationUrl: await authorizeUrl(params.provider, userId, oauthReturn(b.returnTo, params.provider, origin)) };
  } catch (e) {
    throw new ApiError(502, "connect_failed", errorMessage(e));
  }
});

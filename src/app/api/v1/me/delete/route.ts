import { ApiError, apiRoute, body, noContent } from "@/lib/api/http";
import { DeleteAccountRequest } from "@/lib/api/schemas";
import { deleteOwnAccount } from "@/lib/account-deletion";
import { confirmPassword } from "@/lib/signin";
import { clearFailures, clientIp, isLocked, recordFailure } from "@/lib/throttle";
import { UserError } from "@/lib/users";

// Delete the signed-in person's own account and everything recorded for them.
// The password is asked again so a phone left unlocked can't do it.
export const POST = apiRoute(async ({ req, user }) => {
  const ip = clientIp(req.headers);
  if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
  const b = await body(req, DeleteAccountRequest);
  if (!(await confirmPassword(user, b.password))) {
    recordFailure(ip);
    throw new ApiError(401, "bad_password", "That password didn't match, so nothing was deleted");
  }
  clearFailures(ip);
  try {
    await deleteOwnAccount(user);
  } catch (e) {
    if (e instanceof UserError) throw new ApiError(409, "last_admin", e.message);
    throw e;
  }
  return noContent();
});

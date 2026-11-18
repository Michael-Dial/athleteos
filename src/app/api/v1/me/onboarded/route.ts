import { apiRoute, noContent } from "@/lib/api/http";
import { markOnboarded } from "@/lib/users";

// First-run setup finished or skipped in the app. Shared with the web's
// /welcome, so neither asks again for what the account has already set up.
export const POST = apiRoute(async ({ user }) => {
  await markOnboarded(user.id);
  return noContent();
});

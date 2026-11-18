import { ApiError, apiRoute, requireAdminUser } from "@/lib/api/http";
import { isService, testService } from "@/lib/connection-test";

// No body: the saved settings are tested as they are (see lib/connection-test.ts).
export const POST = apiRoute<{ service: string }>(async ({ user, params }) => {
  requireAdminUser(user);
  if (!isService(params.service)) throw new ApiError(404, "not_found", `No service called ${params.service}`);
  return testService(params.service);
});

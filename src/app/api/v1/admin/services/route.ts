import { apiRoute, requireAdminUser } from "@/lib/api/http";
import { serviceStates } from "@/lib/connection-test";

export const GET = apiRoute(async ({ user }) => {
  requireAdminUser(user);
  return { services: await serviceStates() };
});

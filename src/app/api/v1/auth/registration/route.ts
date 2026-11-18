import { json, toErrorResponse } from "@/lib/api/http";
import { registrationStatus } from "@/lib/registration";

// Public: the app's first screen asks whether to offer "Create account".
export async function GET() {
  try {
    return json(await registrationStatus());
  } catch (e) {
    return toErrorResponse(e);
  }
}

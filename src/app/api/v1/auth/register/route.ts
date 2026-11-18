import type { NextRequest } from "next/server";
import { ApiError, body, json, toErrorResponse } from "@/lib/api/http";
import { asApiError } from "@/lib/api/registration-errors";
import { RegisterRequest } from "@/lib/api/schemas";
import { startRegistration } from "@/lib/registration";
import { clientIp, isLocked } from "@/lib/throttle";

// Sign-up from the app, step one: name, email and password in, a 6-digit code
// emailed. The answer is the same whether or not the address has an account.
export async function POST(req: NextRequest) {
  try {
    const ip = clientIp(req.headers);
    if (isLocked(ip)) throw new ApiError(429, "locked", "Too many attempts; wait 15 minutes");
    const b = await body(req, RegisterRequest);
    return json(await startRegistration({ name: b.name, email: b.email, password: b.password, device: b.device }, ip), 202);
  } catch (e) {
    return toErrorResponse(asApiError(e));
  }
}

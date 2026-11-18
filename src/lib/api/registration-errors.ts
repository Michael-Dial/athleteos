import "server-only";
import { RegistrationError } from "../registration";
import { ApiError } from "./http";

const STATUS: Record<RegistrationError["code"], number> = {
  closed: 403, invalid_name: 422, invalid_email: 422, short_password: 422, too_many: 429, mail_failed: 502,
  bad_code: 401, code_expired: 410, code_locked: 429, unknown_challenge: 404, taken: 409,
};

/** Registration's own errors carry the words the app shows; everything else goes through toErrorResponse. */
export function asApiError(e: unknown): unknown {
  return e instanceof RegistrationError ? new ApiError(STATUS[e.code], e.code, e.message) : e;
}

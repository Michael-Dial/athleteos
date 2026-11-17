import { OwError, OwNotConfiguredError } from "../ow/client";

// Athletes see these, so they name "device data", never the backend product;
// the admin finds the backend's own status under Settings → Data backend.

/** User-facing message for a failed device-data read; never blames the user. */
export function errorMessage(e: unknown): string {
  if (e instanceof OwNotConfiguredError) return "Device data isn't set up on this server yet. It's finished under Settings → Data backend.";
  if (e instanceof OwError) {
    if (e.status === 401 || e.status === 403) return "The device data service turned down AthleteOS's credentials. They're checked under Settings → Credentials.";
    if (e.status === 404) return "Your device data account wasn't found. Reconnect it under Settings → Connected accounts.";
    return `The device data service returned an error (${e.status}${e.code ? ` ${e.code}` : ""}). Device data is unavailable until it recovers; try again shortly.`;
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "The device data service didn't respond in time. Device data will load once it's reachable again.";
  }
  if (e instanceof TypeError) return "Couldn't reach the device data service. Device data will load once it's reachable again.";
  return e instanceof Error ? e.message : String(e);
}

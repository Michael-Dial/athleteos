import { OwError, OwNotConfiguredError } from "../ow/client";

/** User-facing message for a failed OW read; never blames the user. */
export function errorMessage(e: unknown): string {
  if (e instanceof OwNotConfiguredError) return "Open Wearables isn't configured yet. Add its URL and credentials to the app environment.";
  if (e instanceof OwError) {
    if (e.status === 401 || e.status === 403) return "Open Wearables rejected AthleteOS's credentials. Check OW_API_KEY or the developer login in the environment.";
    if (e.status === 404) return "Open Wearables couldn't find this user. Re-link the athlete in Settings.";
    return `Open Wearables returned an error (${e.status}${e.code ? ` ${e.code}` : ""}). Device data is unavailable until it recovers; try again shortly.`;
  }
  if (e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError")) {
    return "Open Wearables didn't respond in time. Device data will load once it's reachable again.";
  }
  if (e instanceof TypeError) return "Couldn't reach Open Wearables. Check that the backend is running and reachable from the app.";
  return e instanceof Error ? e.message : String(e);
}

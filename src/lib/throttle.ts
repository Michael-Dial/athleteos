// Per-key attempt limiter for password checks (web login and API token issue).
// In-process memory is enough for a single app container.
const WINDOW_MS = 15 * 60_000;
const MAX = 10;
const attempts = new Map<string, { n: number; reset: number }>();

export function isLocked(key: string, now = Date.now()): boolean {
  const a = attempts.get(key);
  return !!a && a.reset > now && a.n >= MAX;
}

export function recordFailure(key: string, now = Date.now()): void {
  if (attempts.size > 1000) for (const [k, v] of attempts) if (v.reset <= now) attempts.delete(k);
  const a = attempts.get(key);
  attempts.set(key, a && a.reset > now ? { n: a.n + 1, reset: a.reset } : { n: 1, reset: now + WINDOW_MS });
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}

export function clientIp(headers: Headers): string {
  return headers.get("cf-connecting-ip") ?? headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
}

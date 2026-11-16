/** Only same-site relative paths; blocks open redirects like //evil.com or /\\evil.com. */
export function safeNext(v: unknown): string {
  const s = typeof v === "string" ? v : "/";
  return s.startsWith("/") && !s.startsWith("//") && !s.startsWith("/\\") ? s : "/";
}

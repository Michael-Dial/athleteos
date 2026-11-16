// Starts the reminder scheduler once per server process. Runs only in the
// Node.js server runtime (not during `next build`, not in the edge runtime).
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.REMINDERS_DISABLED === "true") return;
  const g = globalThis as unknown as { __aosScheduler?: boolean };
  if (g.__aosScheduler) return;
  g.__aosScheduler = true;
  const { runReminderTick } = await import("./lib/push/webpush");
  const tick = () =>
    runReminderTick().catch((e) => {
      // A missing database at boot is expected briefly; keep ticking.
      console.error("reminder tick failed:", e instanceof Error ? e.message : e);
    });
  // Align to the minute so HH:MM comparisons fire promptly.
  setTimeout(() => {
    void tick();
    setInterval(tick, 60_000).unref();
  }, 60_000 - (Date.now() % 60_000)).unref();
}

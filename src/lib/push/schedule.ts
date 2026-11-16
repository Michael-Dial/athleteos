// Pure decision logic for scheduled reminders, kept free of I/O for testing.

/** Minutes since local midnight for "HH:MM". */
export function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Local wall-clock "HH:MM" of an instant in a timezone. */
export function localHHMM(now: Date, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now);
}

/**
 * Send the morning reminder iff it's enabled, local time is at or after the
 * set time but within the late window, something is due, and nothing was sent
 * today. The late window stops a restart at 23:00 from firing a 07:30 nudge.
 */
export function shouldSendMorning(opts: {
  enabled: boolean;
  nowHHMM: string;
  time: string;
  lateWindowHours: number;
  dueForms: number;
  alreadySent: boolean;
}): boolean {
  if (!opts.enabled || opts.alreadySent || opts.dueForms === 0) return false;
  const now = minutesOf(opts.nowHHMM);
  const at = minutesOf(opts.time);
  return now >= at && now < at + opts.lateWindowHours * 60;
}

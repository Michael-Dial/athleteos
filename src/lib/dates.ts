// Calendar-date helpers. Dates are 'YYYY-MM-DD' strings interpreted in the
// athlete's timezone; arithmetic is done at UTC noon so DST never shifts a day.

export type ISODate = string;

export function todayIn(tz: string, now = new Date()): ISODate {
  return localDate(now, tz);
}

export function localDate(instant: Date | string, tz: string): ISODate {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Local calendar date of an instant using the record's own UTC offset (e.g. "-05:00"). */
export function localDateWithOffset(instant: string, zoneOffset: string | null | undefined, tz: string): ISODate {
  if (!zoneOffset) return localDate(instant, tz);
  const m = /^([+-])(\d{2}):?(\d{2})$/.exec(zoneOffset);
  if (!m) return localDate(instant, tz);
  const mins = (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3]));
  return new Date(new Date(instant).getTime() + mins * 60000).toISOString().slice(0, 10);
}

function noon(d: ISODate): Date {
  return new Date(`${d}T12:00:00Z`);
}

export function addDays(d: ISODate, n: number): ISODate {
  const x = noon(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((noon(a).getTime() - noon(b).getTime()) / 86400000);
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** Monday-start week. */
export function startOfWeek(d: ISODate): ISODate {
  const dow = (noon(d).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const x = noon(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + 1);
  x.setUTCDate(0);
  return x.toISOString().slice(0, 10);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const x = noon(startOfMonth(d));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x.toISOString().slice(0, 10);
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(noon(s).getTime());
}

export function fmtDate(d: ISODate, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return noon(d).toLocaleDateString("en-US", { ...opts, timeZone: "UTC" });
}

export function fmtTime(instant: string, tz: string): string {
  return new Date(instant).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZone: tz });
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || !Number.isFinite(minutes)) return "—";
  const m = Math.round(minutes);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

/** UTC offset (minutes) of `tz` at the given instant. */
export function tzOffsetMinutes(instant: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(instant);
  const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  const asUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second"));
  return Math.round((asUtc - instant.getTime()) / 60000);
}

/** Wall-clock "YYYY-MM-DDTHH:mm" in `tz` -> UTC instant. Two passes settle DST edges. */
export function zonedToUtc(wall: string, tz: string): Date {
  const naive = Date.parse(`${wall.length === 16 ? `${wall}:00` : wall}Z`);
  let t = naive - tzOffsetMinutes(new Date(naive), tz) * 60000;
  t = naive - tzOffsetMinutes(new Date(t), tz) * 60000;
  return new Date(t);
}

/** UTC instant -> wall-clock "YYYY-MM-DDTHH:mm" in `tz` (for datetime-local inputs). */
export function utcToZonedWall(instant: Date | string, tz: string): string {
  const d = typeof instant === "string" ? new Date(instant) : instant;
  return new Date(d.getTime() + tzOffsetMinutes(d, tz) * 60000).toISOString().slice(0, 16);
}

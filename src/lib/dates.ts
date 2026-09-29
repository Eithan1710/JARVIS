/**
 * Date helpers built on plain "YYYY-MM-DD" strings (local calendar dates) plus
 * Intl for timezone conversion. Pure functions, usable on client and server.
 *
 * A "local date" is the calendar date in the user's timezone. All day-level data
 * (habits, check-ins, metrics) is keyed by local date, so arithmetic on these strings
 * is timezone-safe by construction (we do it in UTC).
 */

export type ISODate = string; // YYYY-MM-DD

const DAY_MS = 86_400_000;

export function parseDate(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function formatISO(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return formatISO(new Date(parseDate(d).getTime() + n * DAY_MS));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseDate(a).getTime() - parseDate(b).getTime()) / DAY_MS);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: ISODate): number {
  return parseDate(d).getUTCDay();
}

/** Israeli weeks start on Sunday. */
export function startOfWeek(d: ISODate): ISODate {
  return addDays(d, -weekday(d));
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const dt = parseDate(startOfMonth(d));
  dt.setUTCMonth(dt.getUTCMonth() + 1);
  return addDays(formatISO(dt), -1);
}

export function addMonths(d: ISODate, n: number): ISODate {
  const dt = parseDate(d);
  const day = dt.getUTCDate();
  dt.setUTCDate(1);
  dt.setUTCMonth(dt.getUTCMonth() + n);
  const last = parseDate(endOfMonth(formatISO(dt))).getUTCDate();
  dt.setUTCDate(Math.min(day, last));
  return formatISO(dt);
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string) {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface LocalParts {
  date: ISODate;
  hour: number;
  minute: number;
  /** minutes since local midnight */
  minutes: number;
}

export function localParts(instant: Date | number | string, tz: string): LocalParts {
  const d = instant instanceof Date ? instant : new Date(instant);
  const p = Object.fromEntries(fmt(tz).formatToParts(d).map((x) => [x.type, x.value]));
  const hour = Number(p.hour) % 24;
  const minute = Number(p.minute);
  return { date: `${p.year}-${p.month}-${p.day}`, hour, minute, minutes: hour * 60 + minute };
}

export function toLocalDate(instant: Date | number | string, tz: string): ISODate {
  return localParts(instant, tz).date;
}

export function todayIn(tz: string, now: Date = new Date()): ISODate {
  return toLocalDate(now, tz);
}

/** Offset (minutes) of tz from UTC at a given instant. */
function tzOffsetMinutes(instant: Date, tz: string): number {
  const p = localParts(instant, tz);
  const asUtc = Date.UTC(
    Number(p.date.slice(0, 4)),
    Number(p.date.slice(5, 7)) - 1,
    Number(p.date.slice(8, 10)),
    p.hour,
    p.minute,
    instant.getUTCSeconds(),
  );
  return Math.round((asUtc - instant.getTime()) / 60_000);
}

/** The UTC instant for a local date + "HH:MM" in tz (DST-aware). */
export function zonedTime(date: ISODate, hhmm: string, tz: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const guess = new Date(parseDate(date).getTime() + (h * 60 + m) * 60_000);
  const off1 = tzOffsetMinutes(guess, tz);
  const first = new Date(guess.getTime() - off1 * 60_000);
  const off2 = tzOffsetMinutes(first, tz);
  return off1 === off2 ? first : new Date(guess.getTime() - off2 * 60_000);
}

export function minutesToHHMM(mins: number): string {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
}

export function isValidISODate(s: unknown): boolean {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
}

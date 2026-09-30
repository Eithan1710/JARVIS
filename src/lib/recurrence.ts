import { addDays, addMonths, diffDays, localParts, parseDate, weekday, zonedTime, type ISODate } from "./dates";

/**
 * Recurring schedules in the user's local time (DST-safe via zonedTime).
 * Pure functions — shared by the scheduler, tools and tests.
 */
export interface RecurrenceRule {
  freq: "daily" | "weekly" | "monthly";
  /** Every N days / weeks / months (default 1). */
  interval?: number;
  /** Weekly: 0 = Sunday … 6 = Saturday. Defaults to the start day's weekday. */
  days?: number[];
  /** Local "HH:MM". */
  time: string;
  /** Local anchor date the rule counts intervals from. */
  start?: ISODate;
  /** Stop after this instant (ISO). */
  until?: string;
}

const HHMM = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function normalizeTime(t: string): string | null {
  const m = t.trim().match(HHMM);
  if (!m) return null;
  return `${m[1].padStart(2, "0")}:${m[2]}`;
}

function occursOn(rule: RecurrenceRule, day: ISODate, start: ISODate): boolean {
  const interval = Math.max(1, Math.floor(rule.interval ?? 1));
  const delta = diffDays(day, start);
  if (delta < 0) return false;
  switch (rule.freq) {
    case "daily":
      return delta % interval === 0;
    case "weekly": {
      const days = rule.days?.length ? rule.days : [weekday(start)];
      if (!days.includes(weekday(day))) return false;
      // Weeks counted Sunday-to-Saturday from the anchor's week.
      const weekIndex = Math.floor((delta + weekday(start)) / 7);
      return weekIndex % interval === 0;
    }
    case "monthly": {
      const startDay = parseDate(start).getUTCDate();
      const d = parseDate(day);
      const months = (d.getUTCFullYear() - parseDate(start).getUTCFullYear()) * 12 + (d.getUTCMonth() - parseDate(start).getUTCMonth());
      if (months % interval !== 0) return false;
      // Clamp to the month's last day (e.g. the 31st → 30th in April).
      const target = parseDate(addMonths(start, months)).getUTCDate();
      return d.getUTCDate() === Math.min(startDay, target);
    }
  }
}

/** The first occurrence strictly after `after`, or null when the rule has ended. */
export function nextOccurrence(rule: RecurrenceRule, after: Date, tz: string): Date | null {
  const time = normalizeTime(rule.time);
  if (!time) return null;
  const fromDay = localParts(after, tz).date;
  const start = rule.start ?? fromDay;
  const until = rule.until ? new Date(rule.until).getTime() : Infinity;
  for (let i = 0; i < 800; i++) {
    const day = addDays(fromDay < start ? start : fromDay, i);
    if (!occursOn(rule, day, start)) continue;
    const at = zonedTime(day, time, tz);
    if (at.getTime() <= after.getTime()) continue;
    return at.getTime() > until ? null : at;
  }
  return null;
}

/** Parse a model-provided local datetime ("2026-09-30T20:00" or "2026-09-30 20:00") in tz. */
export function parseLocalDateTime(input: string, tz: string): Date | null {
  const s = input.trim();
  // Absolute instant with offset/Z → trust it.
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) && !Number.isNaN(Date.parse(s))) return new Date(s);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}:\d{2}))?/);
  if (!m) return null;
  const time = normalizeTime(m[2] ?? "09:00");
  if (!time) return null;
  const d = zonedTime(m[1], time, tz);
  return Number.isNaN(d.getTime()) ? null : d;
}

const HE_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** Hebrew description of when something happens, relative to now: "היום ב־20:00", "מחר ב־09:00", "ביום שלישי ב־…". */
export function describeWhen(at: Date, now: Date, tz: string): string {
  const a = localParts(at, tz);
  const n = localParts(now, tz);
  const hhmm = `${String(a.hour).padStart(2, "0")}:${String(a.minute).padStart(2, "0")}`;
  const delta = diffDays(a.date, n.date);
  if (delta === 0) return `היום ב־${hhmm}`;
  if (delta === 1) return `מחר ב־${hhmm}`;
  if (delta > 1 && delta < 7) return `ביום ${HE_DAYS[weekday(a.date)]} ב־${hhmm}`;
  const [y, mo, d] = a.date.split("-");
  return `ב־${Number(d)}.${Number(mo)}${y !== n.date.slice(0, 4) ? `.${y}` : ""} ב־${hhmm}`;
}

export function describeRecurrence(rule: RecurrenceRule): string {
  const interval = Math.max(1, rule.interval ?? 1);
  const time = normalizeTime(rule.time) ?? rule.time;
  if (rule.freq === "daily") return interval === 1 ? `כל יום ב־${time}` : `כל ${interval} ימים ב־${time}`;
  if (rule.freq === "weekly") {
    const days = (rule.days ?? []).slice().sort();
    if (days.length === 7) return `כל יום ב־${time}`;
    if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) return `בימים א׳–ה׳ ב־${time}`;
    const names = days.map((d) => HE_DAYS[d]).join(", ");
    const every = interval === 1 ? "כל שבוע" : `כל ${interval} שבועות`;
    return names ? `${every} בימי ${names} ב־${time}` : `${every} ב־${time}`;
  }
  return interval === 1 ? `כל חודש ב־${time}` : `כל ${interval} חודשים ב־${time}`;
}

/**
 * Hebrew-first formatting. Numbers stay in Western digits (standard in Israel) and are
 * wrapped with direction isolation by the UI where they sit inside Hebrew sentences.
 */
import { bedtimeToClock, METRIC_MAP, type MetricDef } from "./metrics";
import { diffDays, parseDate, type ISODate } from "./dates";

const nf0 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 0 });
const nf1 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 1 });
const nf2 = new Intl.NumberFormat("he-IL", { maximumFractionDigits: 2 });

export function formatNumber(n: number | null | undefined, digits: 0 | 1 | 2 = 1): string {
  if (n == null || Number.isNaN(n)) return "—";
  return (digits === 0 ? nf0 : digits === 1 ? nf1 : nf2).format(n);
}

export function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null || Number.isNaN(ratio)) return "—";
  return `${Math.round(ratio * 100)}%`;
}

export function formatCurrency(amount: number | null | undefined, currency = "ILS"): string {
  if (amount == null || Number.isNaN(amount)) return "—";
  return new Intl.NumberFormat("he-IL", { style: "currency", currency, maximumFractionDigits: amount % 1 === 0 ? 0 : 2 }).format(amount);
}

/** 7.53 → "7:32" */
export function formatHoursClock(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "—";
  const total = Math.round(hours * 60);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** 7.53 → "7 שע׳ 32 דק׳" */
export function formatDuration(hours: number | null | undefined): string {
  if (hours == null || Number.isNaN(hours)) return "—";
  const total = Math.round(hours * 60);
  const h = Math.floor(total / 60);
  const mm = total % 60;
  if (h === 0) return `${mm} דק׳`;
  if (mm === 0) return `${h} שע׳`;
  return `${h} שע׳ ${mm} דק׳`;
}

export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || Number.isNaN(mins)) return "—";
  if (mins >= 90) return formatDuration(mins / 60);
  return `${Math.round(mins)} דק׳`;
}

export function formatMetricValue(key: string, value: number | null | undefined, def?: Pick<MetricDef, "format" | "unit">): string {
  const d = def ?? METRIC_MAP.get(key);
  if (value == null || Number.isNaN(value)) return "—";
  switch (d?.format) {
    case "hours":
      return formatDuration(value);
    case "minutes":
      return formatMinutes(value);
    case "clock":
      return bedtimeToClock(value);
    case "integer":
      return `${formatNumber(value, 0)}${d.unit && d.unit !== "צעדים" ? ` ${d.unit}` : ""}`;
    case "currency":
      return formatCurrency(value);
    case "decimal":
      return `${formatNumber(value, 1)}${d.unit ? ` ${d.unit}` : ""}`;
    default:
      return `${formatNumber(value, 1)}${d?.unit ? ` ${d.unit}` : ""}`;
  }
}

const weekdayLong = new Intl.DateTimeFormat("he-IL", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", timeZone: "UTC" });
const dayMonthShort = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", timeZone: "UTC" });
const dayMonthYear = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const dayMonthYearShort = new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const monthYear = new Intl.DateTimeFormat("he-IL", { month: "long", year: "numeric", timeZone: "UTC" });

export const WEEKDAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
export const WEEKDAY_NAMES = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

/** "יום שלישי, 29 בספטמבר" */
export function formatDayTitle(d: ISODate): string {
  return `${weekdayLong.format(parseDate(d))}, ${dayMonth.format(parseDate(d))}`;
}

export function formatDate(d: ISODate, opts: { year?: boolean; short?: boolean } = {}): string {
  const dt = parseDate(d);
  if (opts.year && opts.short) return dayMonthYearShort.format(dt);
  if (opts.year) return dayMonthYear.format(dt);
  return (opts.short ? dayMonthShort : dayMonth).format(dt);
}

export function formatMonth(d: ISODate): string {
  return monthYear.format(parseDate(d));
}

export function formatRange(from: ISODate, to: ISODate): string {
  if (from === to) return formatDate(from);
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${formatDate(from, { short: true, year: true })} – ${formatDate(to, { short: true, year: true })}`;
  return `${formatDate(from, { short: true })} – ${formatDate(to, { short: true })}`;
}

/** "היום" / "אתמול" / "לפני 3 ימים" / date */
export function formatRelativeDay(d: ISODate, today: ISODate): string {
  const n = diffDays(today, d);
  if (n === 0) return "היום";
  if (n === 1) return "אתמול";
  if (n === -1) return "מחר";
  if (n > 1 && n < 7) return `לפני ${n} ימים`;
  if (n < -1 && n > -7) return `בעוד ${-n} ימים`;
  return formatDate(d);
}

export function formatTime(instant: string | Date, tz: string): string {
  return new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: tz }).format(
    typeof instant === "string" ? new Date(instant) : instant,
  );
}

export function greeting(hour: number): string {
  if (hour < 5) return "לילה טוב";
  if (hour < 12) return "בוקר טוב";
  if (hour < 17) return "צהריים טובים";
  if (hour < 21) return "ערב טוב";
  return "לילה טוב";
}

/** Hebrew plural helper: plural(3, "יום", "ימים") → "3 ימים", plural(1, …) → "יום אחד". */
export function plural(n: number, one: string, many: string, oneWord?: string): string {
  if (n === 1) return oneWord ?? `${one} אחד`;
  if (n === 2 && one === "יום") return "יומיים";
  if (n === 2 && one === "שבוע") return "שבועיים";
  if (n === 2 && one === "חודש") return "חודשיים";
  return `${formatNumber(n, 0)} ${many}`;
}

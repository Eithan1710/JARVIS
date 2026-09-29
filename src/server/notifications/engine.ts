/**
 * Context-aware reminder decisions — pure functions, unit tested.
 *
 * Instead of "remind at a fixed time", the engine estimates when the habit *actually*
 * tends to happen (learned from past completion times, separately for busy days), checks
 * today's calendar, respects quiet hours, and backs off when reminders are being ignored.
 */
import { minutesToHHMM } from "@/lib/dates";
import { median } from "../analytics/stats";

export interface Block {
  start: number; // minutes since local midnight
  end: number;
}

export interface ReminderContext {
  habit: { id: string; name: string; preferredTime: string | null; frequency: "daily" | "specific_days" | "weekly_count"; tier: "main" | "side" };
  nowMinutes: number;
  isWeekend: boolean;
  doneToday: boolean;
  dueToday: boolean;
  weekly?: { done: number; expected: number; daysLeftIncludingToday: number };
  /** Past completion times (minutes), tagged by day type. */
  history: { minutes: number; weekend: boolean; busy: boolean }[];
  busy: Block[];
  quiet: { start: number; end: number };
  /** Reminders for this habit in the last 14 days that were not followed by completion. */
  ignoredRecently: number;
}

export interface ReminderDecision {
  action: "schedule" | "skip";
  at?: number;
  /** Human-readable Hebrew reasoning lines, shown in the UI ("למה קיבלתי את זה?"). */
  reasons: string[];
  basis: "learned" | "learned_busy" | "preferred" | "default";
  typical?: number;
}

const LEAD_MINUTES = 20;

export function inQuiet(m: number, q: { start: number; end: number }): boolean {
  // Quiet window may wrap past midnight (e.g. 22:30–07:30).
  return q.start > q.end ? m >= q.start || m < q.end : m >= q.start && m < q.end;
}

function blockAt(m: number, busy: Block[]): Block | undefined {
  return busy.find((b) => m >= b.start && m < b.end);
}

/** Merge overlapping/adjacent busy blocks (gap < 15 min counts as one block). */
export function mergeBlocks(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a.start - b.start);
  const out: Block[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b.start <= last.end + 15) last.end = Math.max(last.end, b.end);
    else out.push({ ...b });
  }
  return out;
}

export function decideHabitReminder(c: ReminderContext): ReminderDecision {
  const name = `„${c.habit.name}”`;
  if (c.doneToday) return { action: "skip", reasons: [`${name} כבר סומן היום.`], basis: "default" };

  if (c.habit.frequency === "weekly_count") {
    const w = c.weekly;
    if (!w) return { action: "skip", reasons: ["אין נתוני שבוע."], basis: "default" };
    const need = w.expected - w.done;
    if (need <= 0) return { action: "skip", reasons: [`היעד השבועי של ${name} כבר הושג.`], basis: "default" };
    if (need < w.daysLeftIncludingToday) return { action: "skip", reasons: [`נשארו ${need} פעמים ו־${w.daysLeftIncludingToday} ימים — אין צורך להזכיר היום.`], basis: "default" };
  } else if (!c.dueToday) {
    return { action: "skip", reasons: [`${name} לא מתוכנן להיום.`], basis: "default" };
  }

  if (c.ignoredRecently >= 3) {
    return { action: "skip", reasons: [`שלוש התזכורות האחרונות ל${name} לא הובילו לביצוע, אז הפסקתי להזכיר זמנית כדי לא להציף.`], basis: "default" };
  }

  const reasons: string[] = [];
  const sameType = c.history.filter((h) => h.weekend === c.isWeekend);
  const pool = sameType.length >= 5 ? sameType : c.history;
  let typical: number | null = pool.length >= 5 ? median(pool.map((h) => h.minutes)) : null;
  let basis: ReminderDecision["basis"] = "learned";
  if (typical != null) {
    reasons.push(`בדרך כלל ${name} קורה בסביבות ${minutesToHHMM(typical)} (לפי ${pool.length} פעמים קודמות${pool === sameType ? (c.isWeekend ? " בסופי שבוע" : " בימי חול") : ""}).`);
  } else if (c.habit.preferredTime) {
    const [h, m] = c.habit.preferredTime.split(":").map(Number);
    typical = h * 60 + m;
    basis = "preferred";
    reasons.push(`השעה שהגדרת ל${name} היא ${c.habit.preferredTime}.`);
  } else {
    typical = c.habit.tier === "main" ? 18 * 60 : 20 * 60;
    basis = "default";
    reasons.push(`אין עדיין מספיק היסטוריה, אז התזכורת מבוססת על שעת ערב סבירה.`);
  }

  let at = typical - LEAD_MINUTES;
  const busy = mergeBlocks(c.busy);
  const clash = blockAt(typical, busy) ?? blockAt(at, busy);
  if (clash) {
    const busyHistory = c.history.filter((h) => h.busy);
    const busyTypical = busyHistory.length >= 3 ? median(busyHistory.map((h) => h.minutes)) : null;
    if (busyTypical != null && busyTypical >= clash.end) {
      at = busyTypical - LEAD_MINUTES;
      basis = "learned_busy";
      reasons.push(`היומן שלך תפוס היום ${minutesToHHMM(clash.start)}–${minutesToHHMM(clash.end)}. בימים עמוסים ${name} קורה בדרך כלל בסביבות ${minutesToHHMM(busyTypical)}.`);
    } else {
      at = clash.end + 15;
      reasons.push(`היומן שלך תפוס היום ${minutesToHHMM(clash.start)}–${minutesToHHMM(clash.end)}, אז התזכורת נדחתה לאחרי זה.`);
    }
    if (blockAt(at, busy)) at = blockAt(at, busy)!.end + 10;
  }

  if (inQuiet(at, c.quiet)) {
    return { action: "skip", reasons: [...reasons, "השעה המתאימה נופלת בשעות השקט שהגדרת."], basis, typical };
  }
  reasons.push(`לכן התזכורת ב־${minutesToHHMM(at)}.`);
  return { action: "schedule", at, reasons, basis, typical };
}

export interface BudgetState {
  sentToday: number;
  lastSentMinutesAgo: number | null;
  maxPerDay: number;
  minGapMinutes: number;
}

/** Global anti-overload check applied just before sending anything. */
export function budgetAllows(b: BudgetState, priority: "high" | "normal" = "normal"): { ok: boolean; reason?: string } {
  const max = priority === "high" ? b.maxPerDay + 1 : b.maxPerDay;
  if (b.sentToday >= max) return { ok: false, reason: `הגעת למכסה היומית (${b.maxPerDay} התראות).` };
  if (b.lastSentMinutesAgo != null && b.lastSentMinutesAgo < b.minGapMinutes && priority !== "high") {
    return { ok: false, reason: `נשלחה התראה לפני ${b.lastSentMinutesAgo} דקות — ממתין כדי לא להציף.` };
  }
  return { ok: true };
}

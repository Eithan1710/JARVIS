import "server-only";
/**
 * Daily brief & weekly review. Deterministic facts are computed first and stored; the AI adds
 * a short interpretation on top that must cite those facts. If AI is unavailable, a
 * deterministic narrative is used so the feature never breaks.
 */
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { addDays, startOfWeek, weekday, zonedTime, type ISODate } from "@/lib/dates";
import { aggregateNoun, formatFieldValue } from "@/lib/frame-fields";
import { formatDate, formatRange, WEEKDAY_NAMES } from "@/lib/format";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { reports } from "../db/schema";
import { comparePeriods, diffText, makeLookup, type FieldLookup } from "../analytics/compare";
import { mean } from "../analytics/stats";
import { aiConfigured, runStructuredTask } from "../ai/router";
import { listCalendar } from "./data";
import { loadFrame } from "./frame";
import { listGoals } from "./goals";
import { habitSummaries } from "./habits";
import { listInsights } from "./insights";
import { getCheckin } from "./journal";
import { logger } from "../logger";

const log = logger("reports");

export interface ReportFact {
  id: string;
  text: string;
  tone?: "positive" | "negative" | "neutral";
}

type ReportRow = typeof reports.$inferSelect;

async function upsertReport(ctx: UserContext, kind: "daily_brief" | "weekly_review", periodStart: ISODate, periodEnd: ISODate, facts: Record<string, unknown>) {
  const db = await getDb();
  const [row] = await db
    .insert(reports)
    .values({ userId: ctx.userId, kind, periodStart, periodEnd, facts, aiStatus: "skipped" })
    .onConflictDoUpdate({ target: [reports.userId, reports.kind, reports.periodStart], set: { facts, periodEnd, updatedAt: new Date() } })
    .returning();
  return row;
}

export async function getReport(ctx: UserContext, kind: "daily_brief" | "weekly_review", periodStart: ISODate) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(reports)
    .where(and(eq(reports.userId, ctx.userId), eq(reports.kind, kind), eq(reports.periodStart, periodStart)))
    .limit(1);
  return row ?? null;
}

async function saveNarrative(id: string, narrative: Record<string, unknown> | null, status: ReportRow["aiStatus"]) {
  const db = await getDb();
  const [row] = await db.update(reports).set({ narrative, aiStatus: status }).where(eq(reports.id, id)).returning();
  return row;
}

/* ================================================================== */
/* Daily brief                                                         */
/* ================================================================== */

export interface BriefFacts {
  date: ISODate;
  items: ReportFact[];
  yesterday: { habitsDone: number; habitsDue: number; mainDone: number; mainDue: number };
  sleep: { lastNight: number | null; avg7: number | null; avg28: number | null };
  today: { habits: { name: string; timeLabel: string | null; tier: string }[]; events: { title: string; time: string }[]; checkinDone: boolean };
  goalsDue: { title: string; daysLeft: number; progress: number | null }[];
  insight: { id: string; title: string; summary: string } | null;
  wellbeing: { key: string; label: string; avg7: string; avg28: string; delta: number | null }[];
}

export async function buildDailyBrief(ctx: UserContext, date: ISODate = ctx.today): Promise<ReportRow> {
  const from = addDays(date, -34);
  const { frame, habitNames, custom } = await loadFrame(ctx, from, date);
  const lookup = makeLookup(habitNames, custom);
  const yday = frame.find((r) => r.date === addDays(date, -1));
  const todayRow = frame.find((r) => r.date === date);
  const last7 = frame.filter((r) => r.date >= addDays(date, -6));
  const prev28 = frame.filter((r) => r.date < addDays(date, -6) && r.date >= addDays(date, -34));
  const [summaries, goals, insights, checkin, events] = await Promise.all([
    habitSummaries(ctx, { date }),
    listGoals(ctx, { status: "active" }),
    listInsights(ctx, { limit: 3 }),
    getCheckin(ctx, date),
    listCalendar(ctx, zonedTime(date, "00:00", ctx.timezone), zonedTime(addDays(date, 1), "00:00", ctx.timezone)),
  ]);

  const avg = (rows: typeof frame, key: string) => mean(rows.map((r) => r.v[key] ?? null));
  const items: ReportFact[] = [];
  let n = 0;
  const push = (text: string, tone: ReportFact["tone"] = "neutral") => items.push({ id: `B${++n}`, text, tone });

  const yDue = yday?.v.habits_due ?? 0;
  const yDone = yday?.v.habits_done ?? 0;
  const mainY = summaries.filter((s) => s.habit.tier === "main" && s.recent.find((r) => r.date === addDays(date, -1))?.scheduled);
  const mainYDone = mainY.filter((s) => {
    const st = s.recent.find((r) => r.date === addDays(date, -1))?.status;
    return st === "completed" || st === "partial";
  }).length;
  if (yDue) push(`אתמול השלמת ${Number.isInteger(yDone) ? yDone : yDone.toFixed(1)} מתוך ${yDue} הרגלים.`, yDone / yDue >= 0.8 ? "positive" : yDone / yDue < 0.5 ? "negative" : "neutral");
  if (mainY.length) push(`מהפעילויות המתוכננות של אתמול: ${mainYDone} מתוך ${mainY.length}.`);

  const lastNight = todayRow?.v.sleep_hours ?? null;
  const sleep7 = avg(last7, "sleep_hours");
  const sleep28 = avg(prev28, "sleep_hours");
  const sleepInfo = lookup("sleep_hours");
  if (lastNight != null) push(`בלילה ישנת ${formatFieldValue(sleepInfo, lastNight)}.`, lastNight >= 7 ? "positive" : lastNight < 6 ? "negative" : "neutral");
  if (sleep7 != null && sleep28 != null) push(`ממוצע השינה בשבוע האחרון: ${formatFieldValue(sleepInfo, sleep7)} (לעומת ${formatFieldValue(sleepInfo, sleep28)} בחודש שלפני).`);

  const wellbeing = ["mood", "energy", "focus"].map((key) => {
    const a7 = avg(last7, key);
    const a28 = avg(prev28, key);
    const info = lookup(key);
    return { key, label: info.label, avg7: formatFieldValue(info, a7), avg28: formatFieldValue(info, a28), delta: a7 != null && a28 != null ? Math.round((a7 - a28) * 10) / 10 : null };
  });
  for (const w of wellbeing) if (w.delta != null && Math.abs(w.delta) >= 0.8) push(`${w.label} בשבוע האחרון: ${w.avg7} בממוצע, לעומת ${w.avg28} קודם.`, w.delta > 0 ? "positive" : "negative");

  const todayHabits = summaries.filter((s) => s.today.scheduled && s.habit.frequency !== "weekly_count");
  const weekly = summaries.filter((s) => s.habit.frequency === "weekly_count" && s.week.done < s.week.expected);
  if (todayHabits.length) push(`מתוכנן להיום: ${todayHabits.filter((s) => s.habit.tier === "main").map((s) => `${s.habit.name}${s.habit.timeLabel ? ` (${s.habit.timeLabel})` : ""}`).join(", ") || "הרגלים יומיים"}.`);
  for (const w of weekly) {
    const daysLeft = 6 - weekday(date) + 1;
    const need = w.week.expected - w.week.done;
    if (need >= daysLeft) push(`„${w.habit.name}”: נשארו ${need} פעמים ל־${daysLeft} הימים שנותרו בשבוע.`, "negative");
  }

  const fmtTime = new Intl.DateTimeFormat("he-IL", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: ctx.timezone });
  const todayEvents = events.filter((e) => !e.allDay).map((e) => ({ title: e.title, time: fmtTime.format(e.startAt) }));
  if (todayEvents.length) push(`ביומן היום: ${todayEvents.length} אירועים, הראשון ב־${todayEvents[0].time}.`);

  const goalsDue = goals
    .filter((g) => g.daysLeft != null && g.daysLeft >= 0 && g.daysLeft <= 14)
    .map((g) => ({ title: g.goal.title, daysLeft: g.daysLeft!, progress: g.progress }));
  for (const g of goalsDue) push(`המטרה „${g.title}” — עוד ${g.daysLeft} ימים לדדליין${g.progress != null ? `, ${Math.round(g.progress * 100)}% הושלם` : ""}.`);

  const top = insights[0];
  if (top) push(`תובנה בולטת: ${top.summary}`);

  const facts: BriefFacts = {
    date,
    items,
    yesterday: { habitsDone: yDone, habitsDue: yDue, mainDone: mainYDone, mainDue: mainY.length },
    sleep: { lastNight, avg7: sleep7, avg28: sleep28 },
    today: { habits: todayHabits.map((s) => ({ name: s.habit.name, timeLabel: s.habit.timeLabel, tier: s.habit.tier })), events: todayEvents.slice(0, 6), checkinDone: Boolean(checkin) },
    goalsDue,
    insight: top ? { id: top.id, title: top.title, summary: top.summary } : null,
    wellbeing,
  };
  return upsertReport(ctx, "daily_brief", date, date, facts as unknown as Record<string, unknown>);
}

const briefNarrativeSchema = z.object({
  standout: z.string().max(400),
  attention: z.string().max(400),
  evidence: z.array(z.string()).max(8).default([]),
});

function deterministicBriefNarrative(f: BriefFacts) {
  const negative = f.items.find((i) => i.tone === "negative");
  const positive = f.items.find((i) => i.tone === "positive");
  return {
    standout: positive?.text ?? f.items[0]?.text ?? "עדיין אין מספיק נתונים לסיכום — כל נתון שתוסיף היום יעזור.",
    attention: negative?.text ?? (f.today.checkinDone ? "אין משהו חריג — יום רגיל לפי הנתונים." : "עוד לא מילאת צ׳ק־אין היום. זה לוקח חצי דקה."),
    evidence: [negative?.id, positive?.id].filter(Boolean) as string[],
    generated: "rules",
  };
}

export async function narrateDailyBrief(ctx: UserContext, row: ReportRow): Promise<ReportRow> {
  const f = row.facts as unknown as BriefFacts;
  if (!aiConfigured() || !ctx.settings.ai.enabled || f.items.length < 2) {
    return saveNarrative(row.id, deterministicBriefNarrative(f), aiConfigured() ? "skipped" : "unavailable");
  }
  try {
    const { value, model } = await runStructuredTask({
      ctx,
      type: "daily_brief",
      tier: "fast",
      system: `You write a 2-line morning brief in natural Hebrew for a personal analytics app. Use ONLY the facts given. "standout": what stands out today (one sentence). "attention": one concrete thing worth paying attention to today (one sentence, practical, no generic advice). Never invent numbers. No causal claims. Cite fact ids in "evidence". Output JSON {"standout":"","attention":"","evidence":["B1"]}.`,
      messages: [{ role: "user", content: f.items.map((i) => `[${i.id}] ${i.text}`).join("\n") }],
      schema: briefNarrativeSchema,
      dataScope: { briefFacts: f.items.length },
      temperature: 0.5,
    });
    return saveNarrative(row.id, { ...value, generated: "ai", model }, "ok");
  } catch {
    return saveNarrative(row.id, deterministicBriefNarrative(f), "failed");
  }
}

export async function ensureDailyBrief(ctx: UserContext, date: ISODate = ctx.today) {
  const existing = await getReport(ctx, "daily_brief", date);
  // Rebuild facts if older than 3 hours so the brief doesn't go stale during the morning.
  if (existing && Date.now() - existing.updatedAt.getTime() < 3 * 3600_000) return existing;
  const row = await buildDailyBrief(ctx, date);
  if (existing?.narrative && existing.aiStatus === "ok") return { ...row, narrative: existing.narrative, aiStatus: existing.aiStatus };
  return row;
}

/* ================================================================== */
/* Weekly review                                                       */
/* ================================================================== */

export interface WeeklyFacts {
  weekStart: ISODate;
  weekEnd: ISODate;
  complete: boolean;
  items: ReportFact[];
  happened: ReportFact[];
  changes: (ReportFact & { key: string; direction: "up" | "down"; good: boolean | null })[];
  habits: { name: string; tier: string; done: number; expected: number; prevRate: number | null }[];
  goals: { title: string; progressLabel: string; progress: number | null; daysLeft: number | null }[];
  correlations: { id: string; title: string; summary: string; confidence: string | null }[];
  priorWeeks: number;
}

export async function buildWeeklyReview(ctx: UserContext, weekStart: ISODate): Promise<ReportRow> {
  const weekEnd = addDays(weekStart, 6);
  const effectiveEnd = weekEnd < ctx.today ? weekEnd : ctx.today;
  const baseFrom = addDays(weekStart, -28);
  const { frame, habitNames, custom } = await loadFrame(ctx, baseFrom, effectiveEnd);
  const lookup = makeLookup(habitNames, custom);
  const week = frame.filter((r) => r.date >= weekStart);
  const prior = frame.filter((r) => r.date < weekStart);
  const priorWeeks = Math.floor(prior.filter((r) => r.v.habit_rate != null || r.v.mood != null || r.v.sleep_hours != null).length / 5);

  let n = 0;
  const id = () => `W${++n}`;
  const happened: ReportFact[] = [];
  const sum = (key: string) => week.reduce((s, r) => s + (r.v[key] ?? 0), 0);
  const cnt = (key: string) => week.filter((r) => r.v[key] != null).length;
  const avgOf = (rows: typeof frame, key: string) => mean(rows.map((r) => r.v[key] ?? null));

  const due = sum("habits_due");
  if (due) happened.push({ id: id(), text: `השלמת ${Math.round(sum("habits_done"))} מתוך ${due} הרגלים מתוכננים (${Math.round((sum("habits_done") / due) * 100)}%).` });
  const workouts = week.filter((r) => r.v.exercised === 1).length;
  if (cnt("exercised")) happened.push({ id: id(), text: `התאמנת ב־${workouts} ימים.` });
  for (const key of ["sleep_hours", "mood", "energy", "focus", "steps", "work_hours"]) {
    if (cnt(key) >= 2) happened.push({ id: id(), text: `${aggregateNoun(lookup(key))}: ${formatFieldValue(lookup(key), avgOf(week, key))} (${cnt(key)} ימים עם נתונים).` });
  }
  if (cnt("meetings")) happened.push({ id: id(), text: `${Math.round(sum("meetings"))} פגישות ביומן.` });
  if (cnt("spending")) happened.push({ id: id(), text: `הוצאות: ₪${Math.round(sum("spending")).toLocaleString("he-IL")}.` });
  if (cnt("journal")) happened.push({ id: id(), text: `כתבת ${Math.round(sum("journal"))} רשומות ביומן.` });

  const changes: WeeklyFacts["changes"] = [];
  if (priorWeeks >= 2) {
    for (const key of ["habit_rate", "main_habit_rate", "exercised", "sleep_hours", "bedtime", "mood", "energy", "focus", "steps", "work_hours", "meetings", "spending"]) {
      const res = comparePeriods(frame, key, { from: weekStart, to: effectiveEnd }, { from: baseFrom, to: addDays(weekStart, -1) });
      const { a, b, d, diff } = res.comparison;
      if (a.n < 3 || b.n < 6 || d == null || Math.abs(d) < 0.5 || diff == null) continue;
      const info = lookup(key);
      const up = diff > 0;
      changes.push({
        id: id(),
        key,
        direction: up ? "up" : "down",
        good: info.higherIsBetter == null ? null : info.higherIsBetter === up,
        text: `${aggregateNoun(info)} השבוע: ${formatFieldValue(info, a.mean)}, לעומת ${formatFieldValue(info, b.mean)} בממוצע בארבעת השבועות שלפני (${diffText(info, res.comparison)}).`,
      });
    }
  }

  const summaries = await habitSummaries(ctx, { date: effectiveEnd });
  const habits = summaries.map((s) => ({ name: s.habit.name, tier: s.habit.tier, done: s.week.done, expected: s.week.expected, prevRate: s.rate30 }));
  const goals = (await listGoals(ctx, { status: "active" })).map((g) => ({ title: g.goal.title, progressLabel: g.progressLabel, progress: g.progress, daysLeft: g.daysLeft }));
  const correlations = (await listInsights(ctx, { limit: 4 })).map((i) => ({ id: i.id, title: i.title, summary: i.summary, confidence: i.confidenceReason }));

  const items: ReportFact[] = [
    ...happened,
    ...changes,
    ...habits.map((h) => ({ id: id(), text: `„${h.name}”: ${Number.isInteger(h.done) ? h.done : h.done.toFixed(1)} מתוך ${h.expected} השבוע${h.prevRate != null ? ` (30 יום: ${Math.round(h.prevRate * 100)}%)` : ""}.` })),
    ...goals.map((g) => ({ id: id(), text: `מטרה „${g.title}”: ${g.progressLabel}${g.daysLeft != null ? `, ${g.daysLeft} ימים לדדליין` : ""}.` })),
    ...correlations.map((c) => ({ id: id(), text: `דפוס: ${c.summary} (${c.confidence ?? ""})` })),
  ];

  const facts: WeeklyFacts = { weekStart, weekEnd, complete: weekEnd < ctx.today, items, happened, changes, habits, goals, correlations, priorWeeks };
  return upsertReport(ctx, "weekly_review", weekStart, weekEnd, facts as unknown as Record<string, unknown>);
}

const weeklyNarrativeSchema = z.object({
  summary: z.string().max(600),
  positives: z.array(z.object({ text: z.string().max(300), evidence: z.array(z.string()).default([]) })).max(4).default([]),
  concerns: z.array(z.object({ text: z.string().max(300), evidence: z.array(z.string()).default([]) })).max(4).default([]),
  questions: z.array(z.string().max(200)).max(4).default([]),
  observations: z
    .array(z.object({ type: z.enum(["pattern", "hypothesis", "recommendation"]), text: z.string().max(400), evidence: z.array(z.string()).default([]) }))
    .max(4)
    .default([]),
});

function deterministicWeekly(f: WeeklyFacts) {
  const positives = f.changes.filter((c) => c.good === true).map((c) => ({ text: c.text, evidence: [c.id] }));
  const concerns = f.changes.filter((c) => c.good === false).map((c) => ({ text: c.text, evidence: [c.id] }));
  const behind = f.habits.filter((h) => h.expected > 0 && h.done / h.expected < 0.5);
  for (const h of behind.slice(0, 2)) concerns.push({ text: `„${h.name}” הושלם ${Number.isInteger(h.done) ? h.done : h.done.toFixed(1)} מתוך ${h.expected} פעמים השבוע.`, evidence: [] });
  const strong = f.habits.filter((h) => h.expected > 0 && h.done >= h.expected);
  for (const h of strong.slice(0, 2)) positives.push({ text: `„${h.name}” הושלם במלואו השבוע.`, evidence: [] });
  return {
    summary: f.happened.slice(0, 2).map((h) => h.text).join(" ") || "שבוע עם מעט נתונים.",
    positives: positives.slice(0, 4),
    concerns: concerns.slice(0, 4),
    questions: f.changes.slice(0, 3).map((c) => `מה היה שונה השבוע שיכול להסביר את השינוי ב${c.text.split(" השבוע")[0].replace(/^(ממוצע|שיעור) /, "")}?`),
    observations: [],
    generated: "rules",
  };
}

export async function narrateWeeklyReview(ctx: UserContext, row: ReportRow): Promise<ReportRow> {
  const f = row.facts as unknown as WeeklyFacts;
  if (!aiConfigured() || !ctx.settings.ai.enabled || f.items.length < 3) {
    return saveNarrative(row.id, deterministicWeekly(f), aiConfigured() ? "skipped" : "unavailable");
  }
  try {
    const { value, model } = await runStructuredTask({
      ctx,
      type: "weekly_review",
      tier: "balanced",
      system: `You write a weekly review in natural, concise Hebrew for a private personal-analytics app, for the week ${formatRange(f.weekStart, f.weekEnd)}${f.complete ? "" : " (week still in progress)"}.
Use ONLY the facts provided; cite fact ids in "evidence". Never invent numbers. Never claim causation: use "נראה קשור ל…" / "ייתכן ש…". ${f.priorWeeks < 2 ? "There is little history, so avoid comparisons to previous weeks." : ""}
Return JSON:
{"summary":"2-3 sentences","positives":[{"text":"","evidence":["W1"]}],"concerns":[{"text":"","evidence":[]}],"questions":["questions worth investigating"],"observations":[{"type":"pattern|hypothesis|recommendation","text":"","evidence":[]}]}`,
      messages: [{ role: "user", content: f.items.map((i) => `[${i.id}] ${i.text}`).join("\n") }],
      schema: weeklyNarrativeSchema,
      dataScope: { weeklyFacts: f.items.length },
      temperature: 0.4,
    });
    const ids = new Set(f.items.map((i) => i.id));
    const clean = <T extends { evidence: string[] }>(xs: T[]) => xs.map((x) => ({ ...x, evidence: x.evidence.filter((e) => ids.has(e)) }));
    return saveNarrative(row.id, { ...value, positives: clean(value.positives), concerns: clean(value.concerns), observations: clean(value.observations), generated: "ai", model }, "ok");
  } catch (e) {
    log.warn("weekly narrative failed", { error: String(e).slice(0, 100) });
    return saveNarrative(row.id, deterministicWeekly(f), "failed");
  }
}

export async function ensureWeeklyReview(ctx: UserContext, weekStart: ISODate) {
  const existing = await getReport(ctx, "weekly_review", weekStart);
  const complete = addDays(weekStart, 6) < ctx.today;
  // A finished week that was reviewed after it ended is final.
  if (existing && complete && existing.updatedAt.getTime() > zonedTime(addDays(weekStart, 7), "00:00", ctx.timezone).getTime()) return existing;
  if (existing && !complete && Date.now() - existing.updatedAt.getTime() < 2 * 3600_000) return existing;
  const row = await buildWeeklyReview(ctx, weekStart);
  if (existing?.narrative && existing.aiStatus === "ok" && !complete) return { ...row, narrative: existing.narrative, aiStatus: existing.aiStatus };
  return row;
}

export function currentWeekStart(ctx: UserContext) {
  return startOfWeek(ctx.today);
}

export function weekLabel(weekStart: ISODate) {
  return `${formatDate(weekStart, { short: true })} – ${formatDate(addDays(weekStart, 6), { short: true })}`;
}

export { WEEKDAY_NAMES };
export type { FieldLookup };

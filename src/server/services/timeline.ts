import "server-only";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { addDays, diffDays, toLocalDate, zonedTime, type ISODate } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { calendarEvents, dailyCheckins, goalProgress, goals, habitEvents, habits, journalEntries, metrics, transactions } from "../db/schema";

export type TimelineItem =
  | { kind: "metric"; id: string; metricKey: string; value: number; source: string; startAt: string | null; note: string | null }
  | { kind: "habit"; id: string; habitId: string; name: string; status: string; value: number | null; source: string; at: string }
  | { kind: "checkin"; id: string; mood: number | null; energy: number | null; focus: number | null; highlight: string | null; tags: string[] }
  | { kind: "journal"; id: string; title: string | null; body: string; important: boolean; at: string }
  | { kind: "event"; id: string; title: string; startAt: string; endAt: string; allDay: boolean; source: string }
  | { kind: "spending"; total: number; count: number; items: { id: string; amount: number; category: string; merchant: string | null; description: string | null }[] }
  | { kind: "goal_progress"; id: string; goalTitle: string; value: number; unit: string | null };

export interface TimelineDay {
  date: ISODate;
  items: TimelineItem[];
}

/** Chronological feed of everything recorded, newest day first. Max 120 days per request. */
export async function timeline(ctx: UserContext, from: ISODate, to: ISODate): Promise<TimelineDay[]> {
  if (diffDays(to, from) > 119) from = addDays(to, -119);
  const db = await getDb();
  const u = ctx.userId;
  const startI = zonedTime(from, "00:00", ctx.timezone);
  const endI = zonedTime(addDays(to, 1), "00:00", ctx.timezone);
  const [ms, hs, cs, js, es, ts, gp] = await Promise.all([
    db.select().from(metrics).where(and(eq(metrics.userId, u), gte(metrics.date, from), lte(metrics.date, to))).orderBy(asc(metrics.startAt)),
    db
      .select({ e: habitEvents, name: habits.name })
      .from(habitEvents)
      .innerJoin(habits, eq(habits.id, habitEvents.habitId))
      .where(and(eq(habitEvents.userId, u), gte(habitEvents.date, from), lte(habitEvents.date, to))),
    db.select().from(dailyCheckins).where(and(eq(dailyCheckins.userId, u), gte(dailyCheckins.date, from), lte(dailyCheckins.date, to))),
    db.select().from(journalEntries).where(and(eq(journalEntries.userId, u), gte(journalEntries.date, from), lte(journalEntries.date, to))).orderBy(asc(journalEntries.occurredAt)),
    db.select().from(calendarEvents).where(and(eq(calendarEvents.userId, u), gte(calendarEvents.startAt, startI), lte(calendarEvents.startAt, endI))).orderBy(asc(calendarEvents.startAt)),
    db.select().from(transactions).where(and(eq(transactions.userId, u), gte(transactions.date, from), lte(transactions.date, to))),
    db
      .select({ p: goalProgress, title: goals.title, unit: goals.unit })
      .from(goalProgress)
      .innerJoin(goals, eq(goals.id, goalProgress.goalId))
      .where(and(eq(goals.userId, u), gte(goalProgress.recordedAt, startI), lte(goalProgress.recordedAt, endI))),
  ]);

  const days = new Map<ISODate, TimelineItem[]>();
  const add = (d: ISODate, item: TimelineItem) => {
    const arr = days.get(d);
    if (arr) arr.push(item);
    else days.set(d, [item]);
  };
  for (const c of cs) add(c.date, { kind: "checkin", id: c.id, mood: c.mood, energy: c.energy, focus: c.focus, highlight: c.highlight, tags: c.tags });
  for (const m of ms) add(m.date, { kind: "metric", id: m.id, metricKey: m.metricKey, value: m.value, source: m.source, startAt: m.startAt?.toISOString() ?? null, note: m.note });
  for (const { e, name } of hs) add(e.date, { kind: "habit", id: e.id, habitId: e.habitId, name, status: e.status, value: e.value, source: e.source, at: e.occurredAt.toISOString() });
  for (const e of es) add(toLocalDate(e.startAt, ctx.timezone), { kind: "event", id: e.id, title: e.title, startAt: e.startAt.toISOString(), endAt: e.endAt.toISOString(), allDay: e.allDay, source: e.source });
  for (const j of js) add(j.date, { kind: "journal", id: j.id, title: j.title, body: j.body, important: j.important, at: j.occurredAt.toISOString() });
  const byDay = new Map<ISODate, typeof ts>();
  for (const t of ts) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  for (const [d, list] of byDay)
    add(d, { kind: "spending", total: list.reduce((s, t) => s + t.amount, 0), count: list.length, items: list.map((t) => ({ id: t.id, amount: t.amount, category: t.category, merchant: t.merchant, description: t.description })) });
  for (const { p, title, unit } of gp) add(toLocalDate(p.recordedAt, ctx.timezone), { kind: "goal_progress", id: p.id, goalTitle: title, value: p.value, unit });

  return [...days.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1)).map(([date, items]) => ({ date, items }));
}


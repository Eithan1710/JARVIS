import "server-only";
import { and, desc, eq, gte, ne } from "drizzle-orm";
import { addDays, weekday, type ISODate } from "@/lib/dates";
import { nextOccurrence, normalizeTime, type RecurrenceRule } from "@/lib/recurrence";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { habitLogs, habits, reminders, type HabitSchedule } from "../db/schema";
import { cancelReminder, createReminder } from "./reminders";
import { scoreText, searchTerms } from "./text";

export type Habit = typeof habits.$inferSelect;

export function isScheduledOn(h: { schedule: HabitSchedule }, day: ISODate): boolean {
  const days = h.schedule?.days;
  return !days?.length || days.includes(weekday(day));
}

export function habitRule(schedule: HabitSchedule, start: ISODate): RecurrenceRule | null {
  const time = schedule.time ? normalizeTime(schedule.time) : null;
  if (!time) return null;
  const days = schedule.days?.length ? schedule.days : null;
  return days && days.length < 7 ? { freq: "weekly", days, time, start } : { freq: "daily", time, start };
}

export interface CreateHabitInput {
  title: string;
  description?: string | null;
  days?: number[];
  time?: string | null;
  conversationId?: string | null;
}

export async function createHabit(ctx: UserContext, h: CreateHabitInput): Promise<{ habit: Habit; nextReminder: Date | null }> {
  const db = await getDb();
  const days = (h.days ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const schedule: HabitSchedule = { days: [...new Set(days)].sort(), time: h.time ? normalizeTime(h.time) : null };
  const [habit] = await db
    .insert(habits)
    .values({ userId: ctx.userId, title: h.title.trim().slice(0, 200), description: h.description ?? null, schedule })
    .returning();
  const rule = habitRule(schedule, ctx.today);
  let nextReminder: Date | null = null;
  if (rule) {
    nextReminder = nextOccurrence(rule, ctx.now, ctx.timezone);
    if (nextReminder) {
      const r = await createReminder(ctx, { text: habit.title, dueAt: nextReminder, recurrence: rule, kind: "habit", refId: habit.id, conversationId: h.conversationId });
      await db.update(habits).set({ reminderId: r.id }).where(eq(habits.id, habit.id));
      habit.reminderId = r.id;
    }
  }
  return { habit, nextReminder };
}

export async function listHabits(ctx: UserContext): Promise<Habit[]> {
  const db = await getDb();
  return db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), eq(habits.status, "active")))
    .orderBy(desc(habits.createdAt));
}

export async function findHabit(ctx: UserContext, idOrQuery: string): Promise<Habit | null> {
  const db = await getDb();
  const all = await db
    .select()
    .from(habits)
    .where(and(eq(habits.userId, ctx.userId), ne(habits.status, "archived")))
    .orderBy(desc(habits.createdAt));
  const byId = all.find((h) => h.id === idOrQuery);
  if (byId) return byId;
  const terms = searchTerms(idOrQuery);
  const ranked = all.map((h) => ({ h, s: scoreText(`${h.title} ${h.description ?? ""}`, terms) })).sort((a, b) => b.s - a.s);
  if (ranked[0]?.s) return ranked[0].h;
  return all.length === 1 ? all[0] : null;
}

export async function logHabit(ctx: UserContext, habit: Habit, day: ISODate, status: "done" | "skipped" = "done", note?: string) {
  const db = await getDb();
  await db
    .insert(habitLogs)
    .values({ userId: ctx.userId, habitId: habit.id, day, status, note: note ?? null })
    .onConflictDoUpdate({ target: [habitLogs.habitId, habitLogs.day], set: { status, note: note ?? null } });
}

export async function setHabitStatus(ctx: UserContext, habit: Habit, status: Habit["status"]) {
  const db = await getDb();
  await db.update(habits).set({ status }).where(and(eq(habits.id, habit.id), eq(habits.userId, ctx.userId)));
  if (status !== "active" && habit.reminderId) await cancelReminder(ctx, habit.reminderId);
  if (status === "active" && habit.reminderId) {
    const rule = habitRule(habit.schedule, ctx.today);
    const next = rule ? nextOccurrence(rule, ctx.now, ctx.timezone) : null;
    if (next) await db.update(reminders).set({ status: "scheduled", dueAt: next }).where(eq(reminders.id, habit.reminderId));
  }
}

export interface HabitStatus {
  habit: Habit;
  scheduledToday: boolean;
  doneToday: boolean;
  /** Consecutive scheduled days completed, ending today (or yesterday if today is still open). */
  streak: number;
  /** Last 7 local days, oldest first: "done" | "skipped" | "missed" | "off" | "open". */
  week: string[];
}

export async function habitStatuses(ctx: UserContext): Promise<HabitStatus[]> {
  const list = await listHabits(ctx);
  if (!list.length) return [];
  const db = await getDb();
  const since = addDays(ctx.today, -90);
  const logs = await db
    .select({ habitId: habitLogs.habitId, day: habitLogs.day, status: habitLogs.status })
    .from(habitLogs)
    .where(and(eq(habitLogs.userId, ctx.userId), gte(habitLogs.day, since)));
  return list.map((habit) => {
    const mine = new Map(logs.filter((l) => l.habitId === habit.id).map((l) => [String(l.day).slice(0, 10), l.status]));
    const created = habit.createdAt.toISOString().slice(0, 10);
    const state = (day: ISODate) => {
      if (!isScheduledOn(habit, day)) return "off";
      const s = mine.get(day);
      if (s) return s;
      if (day === ctx.today) return "open";
      return day < created ? "off" : "missed";
    };
    let streak = 0;
    for (let i = 0; i < 90; i++) {
      const day = addDays(ctx.today, -i);
      const s = state(day);
      if (s === "off" || (i === 0 && s === "open")) continue;
      if (s === "done") streak++;
      else break;
    }
    const week = Array.from({ length: 7 }, (_, i) => state(addDays(ctx.today, i - 6)));
    return { habit, scheduledToday: isScheduledOn(habit, ctx.today), doneToday: mine.get(ctx.today) === "done", streak, week };
  });
}

export function habitScheduleText(s: HabitSchedule): string {
  const names = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const days = s.days?.length && s.days.length < 7 ? `בימים ${s.days.map((d) => names[d]).join(" ")}` : "כל יום";
  return s.time ? `${days} ב־${s.time}` : days;
}


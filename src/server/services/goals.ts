import "server-only";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { addDays, diffDays, type ISODate } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { goalHabits, goalMilestones, goalProgress, goals } from "../db/schema";
import { notFound } from "../api/handler";
import { habitSummaries } from "./habits";

export const goalInput = z.object({
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullish(),
  progressMode: z.enum(["manual", "milestones", "habits"]).default("manual"),
  targetValue: z.number().nullish(),
  startValue: z.number().nullish(),
  unit: z.string().max(20).nullish(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  notes: z.string().max(4000).nullish(),
  metricKeys: z.array(z.string().max(60)).max(10).default([]),
  habitIds: z.array(z.string().uuid()).max(20).default([]),
  milestones: z.array(z.object({ title: z.string().trim().min(1).max(120), dueDate: z.string().nullish() })).max(30).default([]),
});
export const goalPatch = goalInput
  .omit({ milestones: true })
  .partial()
  .extend({ status: z.enum(["active", "completed", "paused", "abandoned"]).optional() });

export async function getGoal(ctx: UserContext, id: string) {
  const db = await getDb();
  const [g] = await db.select().from(goals).where(and(eq(goals.id, id), eq(goals.userId, ctx.userId))).limit(1);
  if (!g) throw notFound("המטרה");
  return g;
}

export interface GoalView {
  goal: typeof goals.$inferSelect;
  milestones: (typeof goalMilestones.$inferSelect)[];
  habitIds: string[];
  latestValue: number | null;
  progress: number | null;
  progressLabel: string;
  /** Linked-habit consistency over the last 30 days. */
  habitConsistency: number | null;
  daysLeft: number | null;
  /** Expected progress by today on a straight line from creation to deadline. */
  expectedProgress: number | null;
  history: { value: number; recordedAt: Date; note: string | null }[];
}

function linearExpected(created: ISODate, deadline: ISODate | null, today: ISODate): number | null {
  if (!deadline) return null;
  const total = diffDays(deadline, created);
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, diffDays(today, created) / total));
}

export async function listGoals(ctx: UserContext, opts: { status?: string } = {}): Promise<GoalView[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(goals)
    .where(opts.status ? and(eq(goals.userId, ctx.userId), eq(goals.status, opts.status as "active")) : eq(goals.userId, ctx.userId))
    .orderBy(asc(goals.status), asc(goals.deadline), desc(goals.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((g) => g.id);
  const [ms, links, hist, summaries] = await Promise.all([
    db.select().from(goalMilestones).where(inArray(goalMilestones.goalId, ids)).orderBy(asc(goalMilestones.sortOrder)),
    db.select().from(goalHabits).where(inArray(goalHabits.goalId, ids)),
    db.select().from(goalProgress).where(inArray(goalProgress.goalId, ids)).orderBy(asc(goalProgress.recordedAt)),
    habitSummaries(ctx),
  ]);
  const rate30 = new Map(summaries.map((s) => [s.habit.id, s.rate30]));

  return rows.map((g) => {
    const milestones = ms.filter((m) => m.goalId === g.id);
    const habitIds = links.filter((l) => l.goalId === g.id).map((l) => l.habitId);
    const history = hist.filter((h) => h.goalId === g.id).map((h) => ({ value: h.value, recordedAt: h.recordedAt, note: h.note }));
    const latestValue = history.length ? history[history.length - 1].value : null;
    const rates = habitIds.map((id) => rate30.get(id)).filter((x): x is number => x != null);
    const habitConsistency = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null;

    let progress: number | null = null;
    let progressLabel = "";
    if (g.status === "completed") {
      progress = 1;
      progressLabel = "הושלמה";
    } else if (g.progressMode === "milestones") {
      const done = milestones.filter((m) => m.completedAt).length;
      progress = milestones.length ? done / milestones.length : null;
      progressLabel = milestones.length ? `${done} מתוך ${milestones.length} אבני דרך` : "עדיין אין אבני דרך";
    } else if (g.progressMode === "habits") {
      progress = habitConsistency;
      progressLabel = habitConsistency == null ? "אין עדיין נתוני הרגלים" : `עקביות של ${Math.round(habitConsistency * 100)}% בהרגלים הקשורים (30 יום)`;
    } else if (g.targetValue != null && latestValue != null) {
      const start = g.startValue ?? 0;
      const span = g.targetValue - start;
      progress = span === 0 ? 1 : Math.min(1, Math.max(0, (latestValue - start) / span));
      progressLabel = `${latestValue.toLocaleString("he-IL")} מתוך ${g.targetValue.toLocaleString("he-IL")}${g.unit ? ` ${g.unit}` : ""}`;
    } else {
      progressLabel = g.targetValue != null ? "עוד לא עודכנה התקדמות" : "מטרה ללא יעד מספרי";
    }
    const created = g.createdAt.toISOString().slice(0, 10);
    return {
      goal: g,
      milestones,
      habitIds,
      latestValue,
      progress,
      progressLabel,
      habitConsistency,
      daysLeft: g.deadline ? diffDays(g.deadline, ctx.today) : null,
      expectedProgress: g.status === "active" ? linearExpected(created, g.deadline, ctx.today) : null,
      history,
    };
  });
}

export async function goalView(ctx: UserContext, id: string): Promise<GoalView> {
  await getGoal(ctx, id);
  const all = await listGoals(ctx);
  const v = all.find((g) => g.goal.id === id);
  if (!v) throw notFound("המטרה");
  return v;
}

export async function createGoal(ctx: UserContext, input: z.infer<typeof goalInput>) {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { habitIds, milestones, ...rest } = input;
    const [g] = await tx.insert(goals).values({ ...rest, userId: ctx.userId }).returning();
    if (habitIds.length) await tx.insert(goalHabits).values(habitIds.map((habitId) => ({ goalId: g.id, habitId }))).onConflictDoNothing();
    if (milestones.length)
      await tx.insert(goalMilestones).values(milestones.map((m, i) => ({ goalId: g.id, title: m.title, dueDate: m.dueDate ?? null, sortOrder: i })));
    if (rest.startValue != null) await tx.insert(goalProgress).values({ goalId: g.id, value: rest.startValue, note: "נקודת התחלה" });
    return g;
  });
}

export async function updateGoal(ctx: UserContext, id: string, patch: z.infer<typeof goalPatch>) {
  await getGoal(ctx, id);
  const db = await getDb();
  return db.transaction(async (tx) => {
    const { habitIds, ...rest } = patch;
    const values: Partial<typeof goals.$inferInsert> = { ...rest };
    if (patch.status === "completed") values.completedAt = new Date();
    else if (patch.status) values.completedAt = null;
    const [g] = await tx.update(goals).set(values).where(eq(goals.id, id)).returning();
    if (habitIds) {
      await tx.delete(goalHabits).where(eq(goalHabits.goalId, id));
      if (habitIds.length) await tx.insert(goalHabits).values(habitIds.map((habitId) => ({ goalId: id, habitId })));
    }
    return g;
  });
}

export async function deleteGoal(ctx: UserContext, id: string) {
  await getGoal(ctx, id);
  const db = await getDb();
  await db.delete(goals).where(eq(goals.id, id));
}

export async function addGoalProgress(ctx: UserContext, id: string, value: number, note?: string | null) {
  await getGoal(ctx, id);
  const db = await getDb();
  const [row] = await db.insert(goalProgress).values({ goalId: id, value, note: note ?? null }).returning();
  return row;
}

export async function addMilestone(ctx: UserContext, goalId: string, title: string, dueDate?: string | null) {
  await getGoal(ctx, goalId);
  const db = await getDb();
  const existing = await db.select({ id: goalMilestones.id }).from(goalMilestones).where(eq(goalMilestones.goalId, goalId));
  const [row] = await db.insert(goalMilestones).values({ goalId, title, dueDate: dueDate ?? null, sortOrder: existing.length }).returning();
  return row;
}

export async function setMilestone(ctx: UserContext, goalId: string, milestoneId: string, done: boolean) {
  await getGoal(ctx, goalId);
  const db = await getDb();
  const [row] = await db
    .update(goalMilestones)
    .set({ completedAt: done ? new Date() : null })
    .where(and(eq(goalMilestones.id, milestoneId), eq(goalMilestones.goalId, goalId)))
    .returning();
  if (!row) throw notFound("אבן הדרך");
  return row;
}

export async function deleteMilestone(ctx: UserContext, goalId: string, milestoneId: string) {
  await getGoal(ctx, goalId);
  const db = await getDb();
  await db.delete(goalMilestones).where(and(eq(goalMilestones.id, milestoneId), eq(goalMilestones.goalId, goalId)));
}

export const upcomingDeadlineWindow = (today: ISODate) => addDays(today, 14);

import "server-only";
import { and, desc, eq, sql } from "drizzle-orm";
import { addDays, zonedTime } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { goals, type GoalMetric, type GoalProgressEntry } from "../db/schema";
import { rowsOf } from "./reminders";
import { scoreText, searchTerms } from "./text";

export type Goal = typeof goals.$inferSelect;

/** Goal check-ins land in the early evening, when people usually have a minute. */
const CHECK_IN_TIME = "19:30";

export function checkInAt(ctx: UserContext, everyDays: number): Date {
  return zonedTime(addDays(ctx.today, Math.max(1, everyDays)), CHECK_IN_TIME, ctx.timezone);
}

export interface CreateGoalInput {
  title: string;
  description?: string | null;
  metric?: GoalMetric | null;
  dueDate?: string | null;
  checkInEveryDays?: number;
}

export async function createGoal(ctx: UserContext, g: CreateGoalInput): Promise<Goal> {
  const db = await getDb();
  const every = Math.min(60, Math.max(1, Math.round(g.checkInEveryDays ?? 7)));
  const metric = g.metric && Object.values(g.metric).some((v) => v !== undefined && v !== null) ? g.metric : null;
  if (metric && metric.current === undefined && metric.start !== undefined) metric.current = metric.start;
  const [row] = await db
    .insert(goals)
    .values({
      userId: ctx.userId,
      title: g.title.trim().slice(0, 200),
      description: g.description ?? null,
      metric,
      dueDate: g.dueDate ?? null,
      checkInEveryDays: every,
      nextCheckInAt: checkInAt(ctx, every),
      progress: metric?.start !== undefined ? [{ at: ctx.now.toISOString(), value: metric.start, note: "נקודת התחלה" }] : [],
    })
    .returning();
  return row;
}

export async function listGoals(ctx: UserContext, status: Goal["status"] = "active"): Promise<Goal[]> {
  const db = await getDb();
  return db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, ctx.userId), eq(goals.status, status)))
    .orderBy(desc(goals.createdAt));
}

export async function findGoal(ctx: UserContext, idOrQuery: string): Promise<Goal | null> {
  const all = await listGoals(ctx);
  const byId = all.find((g) => g.id === idOrQuery);
  if (byId) return byId;
  const terms = searchTerms(idOrQuery);
  const ranked = all.map((g) => ({ g, s: scoreText(`${g.title} ${g.description ?? ""}`, terms) })).sort((a, b) => b.s - a.s);
  if (ranked[0]?.s) return ranked[0].g;
  return all.length === 1 ? all[0] : null;
}

export interface GoalUpdate {
  value?: number;
  note?: string;
  status?: Goal["status"];
}

export async function updateGoal(ctx: UserContext, goal: Goal, u: GoalUpdate): Promise<Goal> {
  const db = await getDb();
  const entry: GoalProgressEntry = { at: ctx.now.toISOString(), ...(u.value !== undefined ? { value: u.value } : {}), ...(u.note ? { note: u.note.slice(0, 500) } : {}) };
  const progress = entry.value !== undefined || entry.note ? [...(goal.progress ?? []), entry].slice(-200) : goal.progress;
  const metric = goal.metric ? { ...goal.metric, ...(u.value !== undefined ? { current: u.value } : {}) } : u.value !== undefined ? { current: u.value } : null;
  const [row] = await db
    .update(goals)
    .set({
      progress,
      metric,
      ...(u.status ? { status: u.status } : {}),
      nextCheckInAt: u.status && u.status !== "active" ? null : checkInAt(ctx, goal.checkInEveryDays),
    })
    .where(and(eq(goals.id, goal.id), eq(goals.userId, ctx.userId)))
    .returning();
  return row;
}

/** Claim goals whose check-in is due and push their next check-in forward. */
export async function claimDueGoalCheckIns(now: Date, limit = 20): Promise<Goal[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    UPDATE jarvis.goals SET next_check_in_at = ${now.toISOString()}::timestamptz + make_interval(days => check_in_every_days), updated_at = now()
    WHERE id IN (
      SELECT id FROM jarvis.goals
      WHERE status = 'active' AND next_check_in_at IS NOT NULL AND next_check_in_at <= ${now.toISOString()}::timestamptz
      ORDER BY next_check_in_at LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = rowsOf<{ id: string }>(res).map((r) => r.id);
  if (!ids.length) return [];
  return db.select().from(goals).where(sql`${goals.id} IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
}

/** "3/5 ק״ג" style progress text for a goal's metric. */
export function goalProgressText(g: Goal): string | null {
  const m = g.metric;
  if (!m) return null;
  const unit = m.unit ? ` ${m.unit}` : "";
  if (m.current !== undefined && m.target !== undefined) return `כרגע ${m.current}${unit}, יעד ${m.target}${unit}`;
  if (m.target !== undefined) return `יעד ${m.target}${unit}`;
  if (m.current !== undefined) return `כרגע ${m.current}${unit}`;
  return null;
}

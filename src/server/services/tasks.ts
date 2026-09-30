import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { tasks } from "../db/schema";
import { scoreText, searchTerms } from "./text";

export type Task = typeof tasks.$inferSelect;

export async function createTask(ctx: UserContext, t: { title: string; notes?: string | null; dueAt?: Date | null; priority?: number }): Promise<Task> {
  const db = await getDb();
  const [row] = await db
    .insert(tasks)
    .values({
      userId: ctx.userId,
      title: t.title.trim().slice(0, 300),
      notes: t.notes ?? null,
      dueAt: t.dueAt ?? null,
      priority: Math.min(3, Math.max(1, Math.round(t.priority ?? 2))),
    })
    .returning();
  return row;
}

export async function listOpenTasks(ctx: UserContext, limit = 30): Promise<Task[]> {
  const db = await getDb();
  return db
    .select()
    .from(tasks)
    .where(and(eq(tasks.userId, ctx.userId), eq(tasks.status, "open")))
    .orderBy(sql`${tasks.dueAt} NULLS LAST`, asc(tasks.priority), asc(tasks.createdAt))
    .limit(limit);
}

export async function findTask(ctx: UserContext, idOrQuery: string): Promise<Task | null> {
  const all = await listOpenTasks(ctx, 300);
  const byId = all.find((t) => t.id === idOrQuery);
  if (byId) return byId;
  const terms = searchTerms(idOrQuery);
  const ranked = all.map((t) => ({ t, s: scoreText(t.title, terms) })).sort((a, b) => b.s - a.s);
  return ranked[0]?.s ? ranked[0].t : null;
}

export async function setTaskStatus(ctx: UserContext, id: string, status: Task["status"]) {
  const db = await getDb();
  const [row] = await db
    .update(tasks)
    .set({ status, completedAt: status === "done" ? new Date() : null })
    .where(and(eq(tasks.id, id), eq(tasks.userId, ctx.userId)))
    .returning();
  return row ?? null;
}

import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { nextOccurrence, type RecurrenceRule } from "@/lib/recurrence";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { reminders } from "../db/schema";
import { scoreText, searchTerms } from "./text";

export type Reminder = typeof reminders.$inferSelect;

export interface CreateReminderInput {
  text: string;
  dueAt: Date;
  recurrence?: RecurrenceRule | null;
  conversationId?: string | null;
  kind?: "reminder" | "habit";
  refId?: string | null;
}

export async function createReminder(ctx: UserContext, r: CreateReminderInput): Promise<Reminder> {
  const db = await getDb();
  const [row] = await db
    .insert(reminders)
    .values({
      userId: ctx.userId,
      text: r.text.trim().slice(0, 500),
      dueAt: r.dueAt,
      recurrence: r.recurrence ?? null,
      conversationId: r.conversationId ?? null,
      kind: r.kind ?? "reminder",
      refId: r.refId ?? null,
    })
    .returning();
  return row;
}

export async function listReminders(ctx: UserContext, limit = 20): Promise<Reminder[]> {
  const db = await getDb();
  return db
    .select()
    .from(reminders)
    .where(and(eq(reminders.userId, ctx.userId), eq(reminders.status, "scheduled")))
    .orderBy(asc(reminders.dueAt))
    .limit(limit);
}

export async function findReminders(ctx: UserContext, idOrQuery: string): Promise<Reminder[]> {
  const all = await listReminders(ctx, 200);
  const byId = all.find((r) => r.id === idOrQuery);
  if (byId) return [byId];
  const terms = searchTerms(idOrQuery);
  return all
    .map((r) => ({ r, s: scoreText(r.text, terms) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.r);
}

export async function cancelReminder(ctx: UserContext, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(reminders)
    .set({ status: "cancelled" })
    .where(and(eq(reminders.id, id), eq(reminders.userId, ctx.userId)))
    .returning({ id: reminders.id });
  return rows.length > 0;
}

/**
 * Atomically claim due reminders across all users (safe when two scheduler ticks overlap).
 * Reminders stuck in "sending" for 5 minutes (a crashed tick) are reclaimed.
 */
export async function claimDueReminders(now: Date, limit = 25): Promise<Reminder[]> {
  const db = await getDb();
  const iso = now.toISOString();
  const res = await db.execute(sql`
    UPDATE jarvis.reminders SET status = 'sending', updated_at = now()
    WHERE id IN (
      SELECT id FROM jarvis.reminders
      WHERE (status = 'scheduled' AND due_at <= ${iso}::timestamptz)
         OR (status = 'sending' AND updated_at < ${iso}::timestamptz - interval '5 minutes')
      ORDER BY due_at
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const ids = rowsOf<{ id: string }>(res).map((r) => r.id);
  if (!ids.length) return [];
  return db
    .select()
    .from(reminders)
    .where(sql`${reminders.id} IN (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);
}

/** After delivery: schedule the next occurrence of a recurring reminder, or mark it done. */
export async function settleReminder(r: Reminder, now: Date, tz: string): Promise<Date | null> {
  const db = await getDb();
  const next = r.recurrence ? nextOccurrence(r.recurrence, new Date(Math.max(now.getTime(), r.dueAt.getTime())), tz) : null;
  await db
    .update(reminders)
    .set(next ? { status: "scheduled", dueAt: next, lastFiredAt: now, fireCount: r.fireCount + 1 } : { status: "done", lastFiredAt: now, fireCount: r.fireCount + 1 })
    .where(eq(reminders.id, r.id));
  return next;
}

/** drizzle's execute() returns rows directly on postgres-js and `{ rows }` on PGlite. */
export function rowsOf<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  const rows = (res as { rows?: T[] })?.rows;
  return Array.isArray(rows) ? rows : [];
}

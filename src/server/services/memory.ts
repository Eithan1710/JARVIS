import "server-only";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { memories, type MemoryKind } from "../db/schema";
import { likeEscape, normalizeFact, scoreText, searchTerms } from "./text";

export type Memory = typeof memories.$inferSelect;

export const MEMORY_KINDS: MemoryKind[] = ["preference", "fact", "project", "person", "instruction", "routine", "other"];

export async function listMemories(ctx: UserContext, limit = 80): Promise<Memory[]> {
  const db = await getDb();
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, ctx.userId), eq(memories.status, "active")))
    .orderBy(desc(memories.importance), desc(memories.updatedAt))
    .limit(limit);
}

export interface SaveMemoryInput {
  content: string;
  kind?: MemoryKind;
  importance?: number;
  source?: "explicit" | "extracted";
  sourceMessageId?: string | null;
  /** Replace this memory instead of adding a new one. */
  replaceId?: string;
}

/** Save a memory, merging with an existing near-identical one instead of duplicating. */
export async function saveMemory(ctx: UserContext, m: SaveMemoryInput): Promise<{ memory: Memory; created: boolean }> {
  const db = await getDb();
  const content = m.content.trim().slice(0, 600);
  const importance = Math.min(5, Math.max(1, Math.round(m.importance ?? (m.source === "explicit" ? 4 : 3))));
  if (m.replaceId) {
    const [row] = await db
      .update(memories)
      .set({ content, kind: m.kind, importance, source: m.source })
      .where(and(eq(memories.id, m.replaceId), eq(memories.userId, ctx.userId)))
      .returning();
    if (row) return { memory: row, created: false };
  }
  const key = normalizeFact(content);
  const existing = await listMemories(ctx, 300);
  const dup = existing.find((e) => normalizeFact(e.content) === key);
  if (dup) {
    const [row] = await db
      .update(memories)
      .set({ importance: Math.max(dup.importance, importance), kind: m.kind ?? dup.kind })
      .where(eq(memories.id, dup.id))
      .returning();
    return { memory: row, created: false };
  }
  const [row] = await db
    .insert(memories)
    .values({ userId: ctx.userId, content, kind: m.kind ?? "fact", importance, source: m.source ?? "extracted", sourceMessageId: m.sourceMessageId ?? null })
    .returning();
  return { memory: row, created: true };
}

export async function searchMemories(ctx: UserContext, query: string, limit = 10): Promise<Memory[]> {
  const terms = searchTerms(query);
  if (!terms.length) return listMemories(ctx, limit);
  const db = await getDb();
  const rows = await db
    .select()
    .from(memories)
    .where(
      and(
        eq(memories.userId, ctx.userId),
        eq(memories.status, "active"),
        or(...terms.map((t) => sql`${memories.content} ILIKE ${`%${likeEscape(t)}%`}`)),
      ),
    )
    .limit(100);
  return rows.sort((a, b) => scoreText(b.content, terms) - scoreText(a.content, terms) || b.importance - a.importance).slice(0, limit);
}

/** Archive memories by id (never hard-deleted — history stays complete). */
export async function forgetMemories(ctx: UserContext, ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const db = await getDb();
  const rows = await db
    .update(memories)
    .set({ status: "archived" })
    .where(and(eq(memories.userId, ctx.userId), inArray(memories.id, ids)))
    .returning({ id: memories.id });
  return rows.length;
}

export async function touchMemories(ctx: UserContext, ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  await db
    .update(memories)
    .set({ lastUsedAt: new Date() })
    .where(and(eq(memories.userId, ctx.userId), inArray(memories.id, ids)));
}

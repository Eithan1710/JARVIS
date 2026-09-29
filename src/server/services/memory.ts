import "server-only";
import { and, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { z } from "zod";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { memories, type MemoryKind } from "../db/schema";
import { notFound } from "../api/handler";
import { searchTerms } from "./journal";

export const memoryInput = z.object({
  kind: z.enum(["fact", "preference", "goal", "event", "pattern"]),
  content: z.string().trim().min(2).max(500),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
});
export const memoryPatch = z.object({
  content: z.string().trim().min(2).max(500).optional(),
  kind: z.enum(["fact", "preference", "goal", "event", "pattern"]).optional(),
  status: z.enum(["active", "rejected", "archived"]).optional(),
});

export type MemoryRow = typeof memories.$inferSelect;

export async function listMemories(ctx: UserContext, opts: { status?: MemoryRow["status"][] } = {}) {
  const db = await getDb();
  const statuses = opts.status ?? ["active", "proposed"];
  return db
    .select()
    .from(memories)
    .where(and(eq(memories.userId, ctx.userId), inArray(memories.status, statuses)))
    .orderBy(desc(memories.updatedAt));
}

/** User-created memories are active immediately — the user is the source of truth. */
export async function createMemory(ctx: UserContext, input: z.infer<typeof memoryInput>) {
  const db = await getDb();
  const [row] = await db
    .insert(memories)
    .values({ ...input, userId: ctx.userId, status: "active", source: "user", confidence: "high", confirmedAt: new Date() })
    .returning();
  return row;
}

/**
 * AI/insight-originated memories are only ever *proposed*. They become part of the model of
 * the user only after explicit confirmation. Near-duplicates are skipped.
 */
export async function proposeMemories(
  ctx: UserContext,
  items: { kind: MemoryKind; content: string; confidence?: "high" | "medium" | "low" }[],
  source: string,
  sourceRef: Record<string, unknown>,
) {
  if (!items.length || !ctx.settings.ai.proposeMemories) return [];
  const db = await getDb();
  const existing = await listMemories(ctx, { status: ["active", "proposed", "rejected"] });
  const norm = (s: string) => s.replace(/[^\p{L}\p{N}]/gu, "");
  const seen = new Set(existing.map((m) => norm(m.content)));
  const fresh = items.filter((i) => i.content.trim().length >= 4 && !seen.has(norm(i.content))).slice(0, 3);
  if (!fresh.length) return [];
  return db
    .insert(memories)
    .values(fresh.map((i) => ({ userId: ctx.userId, kind: i.kind, content: i.content.trim(), status: "proposed" as const, source, sourceRef, confidence: i.confidence ?? "medium" })))
    .returning();
}

export async function updateMemory(ctx: UserContext, id: string, patch: z.infer<typeof memoryPatch>) {
  const db = await getDb();
  const values: Partial<typeof memories.$inferInsert> = { ...patch };
  if (patch.status === "active") values.confirmedAt = new Date();
  const [row] = await db.update(memories).set(values).where(and(eq(memories.id, id), eq(memories.userId, ctx.userId))).returning();
  if (!row) throw notFound("הזיכרון");
  return row;
}

export async function deleteMemory(ctx: UserContext, id: string) {
  const db = await getDb();
  await db.delete(memories).where(and(eq(memories.id, id), eq(memories.userId, ctx.userId)));
}

/** Keyword search over active memories; always includes stable preferences/facts when few match. */
export async function searchMemories(ctx: UserContext, query: string, limit = 10) {
  const db = await getDb();
  const terms = searchTerms(query);
  const base = and(eq(memories.userId, ctx.userId), eq(memories.status, "active"));
  const matched = terms.length
    ? await db
        .select()
        .from(memories)
        .where(and(base, or(...terms.map((t) => ilike(memories.content, `%${t}%`)))))
        .limit(limit)
    : [];
  if (matched.length >= limit) return matched;
  const general = await db
    .select()
    .from(memories)
    .where(and(base, inArray(memories.kind, ["preference", "fact", "goal"])))
    .orderBy(desc(memories.updatedAt))
    .limit(limit);
  const ids = new Set(matched.map((m) => m.id));
  return [...matched, ...general.filter((g) => !ids.has(g.id))].slice(0, limit);
}

import "server-only";
import { and, desc, eq, gte, ilike, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { ISODate } from "@/lib/dates";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { dailyCheckins, journalEntries } from "../db/schema";
import { notFound } from "../api/handler";

const score = z.number().int().min(1).max(10).nullish();

export const checkinInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mood: score,
  energy: score,
  focus: score,
  note: z.string().max(4000).nullish(),
  highlight: z.string().max(500).nullish(),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).optional(),
});

/** Upsert: partial check-ins merge with what's already there, so fields can be filled in any order. */
export async function upsertCheckin(ctx: UserContext, input: z.infer<typeof checkinInput>) {
  const db = await getDb();
  const [existing] = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, ctx.userId), eq(dailyCheckins.date, input.date)))
    .limit(1);
  const merged = {
    mood: input.mood !== undefined ? input.mood : (existing?.mood ?? null),
    energy: input.energy !== undefined ? input.energy : (existing?.energy ?? null),
    focus: input.focus !== undefined ? input.focus : (existing?.focus ?? null),
    note: input.note !== undefined ? input.note : (existing?.note ?? null),
    highlight: input.highlight !== undefined ? input.highlight : (existing?.highlight ?? null),
    tags: input.tags ?? existing?.tags ?? [],
  };
  const [row] = await db
    .insert(dailyCheckins)
    .values({ userId: ctx.userId, date: input.date, ...merged })
    .onConflictDoUpdate({ target: [dailyCheckins.userId, dailyCheckins.date], set: { ...merged, updatedAt: new Date() } })
    .returning();
  return row;
}

export async function getCheckin(ctx: UserContext, date: ISODate) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, ctx.userId), eq(dailyCheckins.date, date)))
    .limit(1);
  return row ?? null;
}

export async function listCheckins(ctx: UserContext, from: ISODate, to: ISODate) {
  const db = await getDb();
  return db
    .select()
    .from(dailyCheckins)
    .where(and(eq(dailyCheckins.userId, ctx.userId), gte(dailyCheckins.date, from), lte(dailyCheckins.date, to)))
    .orderBy(desc(dailyCheckins.date));
}

export const journalInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  title: z.string().trim().max(160).nullish(),
  body: z.string().trim().min(1).max(20000),
  tags: z.array(z.string().trim().min(1).max(30)).max(12).default([]),
  important: z.boolean().default(false),
  /** Client-generated id so offline replays don't duplicate entries. */
  clientId: z.string().uuid().optional(),
});
export const journalPatch = journalInput.omit({ clientId: true }).partial();

export async function createJournal(ctx: UserContext, input: z.infer<typeof journalInput>) {
  const db = await getDb();
  const { clientId, ...rest } = input;
  const [row] = await db
    .insert(journalEntries)
    .values({ ...(clientId ? { id: clientId } : {}), ...rest, userId: ctx.userId })
    .onConflictDoNothing()
    .returning();
  if (!row && clientId) {
    const [existing] = await db.select().from(journalEntries).where(eq(journalEntries.id, clientId)).limit(1);
    return existing;
  }
  return row;
}

export async function updateJournal(ctx: UserContext, id: string, patch: z.infer<typeof journalPatch>) {
  const db = await getDb();
  const [row] = await db
    .update(journalEntries)
    .set(patch)
    .where(and(eq(journalEntries.id, id), eq(journalEntries.userId, ctx.userId)))
    .returning();
  if (!row) throw notFound("הרשומה");
  return row;
}

export async function deleteJournal(ctx: UserContext, id: string) {
  const db = await getDb();
  await db.delete(journalEntries).where(and(eq(journalEntries.id, id), eq(journalEntries.userId, ctx.userId)));
}

export async function listJournal(ctx: UserContext, opts: { from?: ISODate; to?: ISODate; q?: string; limit?: number } = {}) {
  const db = await getDb();
  const conds = [eq(journalEntries.userId, ctx.userId)];
  if (opts.from) conds.push(gte(journalEntries.date, opts.from));
  if (opts.to) conds.push(lte(journalEntries.date, opts.to));
  if (opts.q?.trim()) {
    const terms = searchTerms(opts.q);
    const termConds = terms.flatMap((t) => [ilike(journalEntries.body, `%${t}%`), ilike(journalEntries.title, `%${t}%`)]);
    if (termConds.length) conds.push(or(...termConds)!);
  }
  return db
    .select()
    .from(journalEntries)
    .where(and(...conds))
    .orderBy(desc(journalEntries.date), desc(journalEntries.occurredAt))
    .limit(opts.limit ?? 50);
}

const HEBREW_PREFIXES = ["וה", "שה", "וב", "ול", "ומ", "כש", "ה", "ו", "ב", "ל", "מ", "ש", "כ"];
const STOP = new Set(["של", "את", "על", "עם", "אני", "זה", "מה", "למה", "איך", "כמה", "היה", "הייתי", "לי", "גם", "או", "אם", "כי", "לא", "יותר", "פחות", "הכי", "אחרי", "לפני", "the", "and"]);

/**
 * Split a Hebrew query into search stems: strips common one/two-letter prefixes
 * (ה, ו, ב, ל, מ, ש, כ) so "באימונים" also matches "אימון".
 */
export function searchTerms(q: string): string[] {
  const words = q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP.has(w));
  const out = new Set<string>();
  for (const w of words) {
    let stem = w;
    for (const p of HEBREW_PREFIXES) {
      if (stem.startsWith(p) && stem.length - p.length >= 3) {
        stem = stem.slice(p.length);
        break;
      }
    }
    // Plural/suffix trimming: ים / ות / ה
    stem = stem.replace(/(ים|ות)$/u, "");
    if (stem.length >= 2) out.add(stem);
  }
  return [...out].slice(0, 8);
}

export async function journalStats(ctx: UserContext) {
  const db = await getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int`, first: sql<string | null>`min(${journalEntries.date})::text` })
    .from(journalEntries)
    .where(eq(journalEntries.userId, ctx.userId));
  return row;
}

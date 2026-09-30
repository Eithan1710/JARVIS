import "server-only";
import { and, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { conversations, messages } from "../db/schema";
import { clip, likeEscape, scoreText, searchTerms } from "./text";

export interface HistoryHit {
  messageId: string;
  conversationId: string;
  conversationTitle: string | null;
  role: string;
  at: string;
  snippet: string;
  score: number;
}

/**
 * Keyword search over the complete conversation history (everything is kept; nothing is loaded
 * by default). Substring matching copes with Hebrew prefixes; results rank by terms matched, then recency.
 */
export async function searchHistory(
  ctx: UserContext,
  query: string,
  opts: { limit?: number; excludeConversationId?: string; from?: Date; to?: Date } = {},
): Promise<HistoryHit[]> {
  const terms = searchTerms(query);
  const db = await getDb();
  const conds: (SQL | undefined)[] = [eq(messages.userId, ctx.userId)];
  if (opts.excludeConversationId) conds.push(ne(messages.conversationId, opts.excludeConversationId));
  if (opts.from) conds.push(sql`${messages.createdAt} >= ${opts.from.toISOString()}::timestamptz`);
  if (opts.to) conds.push(sql`${messages.createdAt} <= ${opts.to.toISOString()}::timestamptz`);
  if (terms.length) conds.push(or(...terms.map((t) => sql`${messages.content} ILIKE ${`%${likeEscape(t)}%`}`)));
  else if (!opts.from && !opts.to) return [];
  const rows = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      role: messages.role,
      content: messages.content,
      createdAt: messages.createdAt,
      title: conversations.title,
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(and(...conds))
    .orderBy(desc(messages.createdAt))
    .limit(200);
  return rows
    .map((r) => ({
      messageId: r.id,
      conversationId: r.conversationId,
      conversationTitle: r.title,
      role: r.role,
      at: r.createdAt.toISOString(),
      snippet: snippetAround(r.content, terms),
      score: terms.length ? scoreText(r.content, terms) : 1,
    }))
    .sort((a, b) => b.score - a.score || b.at.localeCompare(a.at))
    .slice(0, opts.limit ?? 8);
}

function snippetAround(text: string, terms: string[], width = 260): string {
  const lower = text.toLowerCase();
  const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, idx - 80);
  return (start > 0 ? "…" : "") + clip(text.slice(start), width);
}

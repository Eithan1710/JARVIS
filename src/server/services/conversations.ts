import "server-only";
import { and, desc, eq, isNull, lt, sql } from "drizzle-orm";
import type { ChatMessage, ConversationSummary } from "@/lib/protocol";
import type { UserContext } from "../context";
import { getDb } from "../db/client";
import { conversations, messages, type MessageKind, type MessageRole } from "../db/schema";

export async function getConversation(ctx: UserContext, id: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, id), eq(conversations.userId, ctx.userId)))
    .limit(1);
  return row ?? null;
}

export async function createConversation(ctx: UserContext) {
  const db = await getDb();
  const [row] = await db.insert(conversations).values({ userId: ctx.userId }).returning();
  return row;
}

/** The conversation to continue: the given one if it belongs to the user, else a new one. */
export async function resolveConversation(ctx: UserContext, id?: string | null) {
  if (id) {
    const c = await getConversation(ctx, id);
    if (c) return c;
  }
  return createConversation(ctx);
}

/** Most recently active conversation (proactive messages land here). */
export async function latestConversation(ctx: UserContext) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.userId, ctx.userId), isNull(conversations.archivedAt)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(1);
  return row ?? null;
}

export interface AppendInput {
  conversationId: string;
  role: MessageRole;
  content: string;
  inputMode?: "text" | "voice" | "system";
  kind?: MessageKind;
  meta?: Record<string, unknown>;
}

export async function appendMessage(ctx: UserContext, m: AppendInput) {
  const db = await getDb();
  const [row] = await db
    .insert(messages)
    .values({
      userId: ctx.userId,
      conversationId: m.conversationId,
      role: m.role,
      content: m.content,
      inputMode: m.inputMode ?? "text",
      kind: m.kind ?? "chat",
      meta: m.meta ?? {},
    })
    .returning();
  await db.update(conversations).set({ lastMessageAt: row.createdAt }).where(eq(conversations.id, m.conversationId));
  return row;
}

export async function setMessageMeta(ctx: UserContext, id: string, meta: Record<string, unknown>) {
  const db = await getDb();
  await db
    .update(messages)
    .set({ meta: sql`${messages.meta} || ${JSON.stringify(meta)}::jsonb` })
    .where(and(eq(messages.id, id), eq(messages.userId, ctx.userId)));
}

export async function setTitle(ctx: UserContext, id: string, title: string) {
  const db = await getDb();
  await db
    .update(conversations)
    .set({ title })
    .where(and(eq(conversations.id, id), eq(conversations.userId, ctx.userId)));
}

type Row = typeof messages.$inferSelect;

export function toChatMessage(r: Row): ChatMessage {
  const meta = (r.meta ?? {}) as Record<string, unknown>;
  return {
    id: r.id,
    role: r.role,
    content: r.content,
    kind: r.kind,
    inputMode: r.inputMode,
    createdAt: r.createdAt.toISOString(),
    steps: Array.isArray(meta.steps) ? (meta.steps as ChatMessage["steps"]) : undefined,
    actions: Array.isArray(meta.actions) ? (meta.actions as ChatMessage["actions"]) : undefined,
    chips: Array.isArray(meta.chips) ? (meta.chips as ChatMessage["chips"]) : undefined,
  };
}

/** Messages in chronological order; `before` pages backwards. */
export async function listMessages(ctx: UserContext, conversationId: string, opts: { limit?: number; before?: Date } = {}) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, conversationId),
        eq(messages.userId, ctx.userId),
        opts.before ? lt(messages.createdAt, opts.before) : undefined,
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(opts.limit ?? 60);
  return rows.reverse();
}

/** New messages across all conversations since an instant (reminders delivered while the app was open). */
export async function messagesSince(ctx: UserContext, since: Date) {
  const db = await getDb();
  const rows = await db
    .select()
    .from(messages)
    .where(and(eq(messages.userId, ctx.userId), sql`${messages.createdAt} > ${since.toISOString()}::timestamptz`, sql`${messages.kind} <> 'chat'`))
    .orderBy(messages.createdAt)
    .limit(50);
  return rows;
}

export async function listConversations(ctx: UserContext, limit = 40): Promise<ConversationSummary[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: conversations.id,
      title: conversations.title,
      lastMessageAt: conversations.lastMessageAt,
      preview: sql<string | null>`(SELECT content FROM jarvis.messages m WHERE m.conversation_id = ${conversations.id} ORDER BY m.created_at DESC LIMIT 1)`,
    })
    .from(conversations)
    .where(and(eq(conversations.userId, ctx.userId), isNull(conversations.archivedAt)))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit);
  return rows.map((r) => ({ id: r.id, title: r.title, lastMessageAt: new Date(r.lastMessageAt).toISOString(), preview: r.preview }));
}

export async function archiveConversation(ctx: UserContext, id: string) {
  const db = await getDb();
  await db
    .update(conversations)
    .set({ archivedAt: new Date() })
    .where(and(eq(conversations.id, id), eq(conversations.userId, ctx.userId)));
}

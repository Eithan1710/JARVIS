import "server-only";
import { z } from "zod";
import { forgetMemories, saveMemory, searchMemories } from "../../services/memory";
import { searchHistory } from "../../services/history";
import { defineTool } from "../types";

const kind = z.enum(["preference", "fact", "project", "person", "instruction", "routine", "other"]).catch("fact");

export const saveMemoryTool = defineTool({
  name: "save_memory",
  description:
    "Store a durable fact about the user in long-term memory (preferences, personal facts, projects, people, standing instructions, routines). Use when the user asks you to remember something, or states something clearly worth knowing next month. Write it as a short third-person English or Hebrew sentence, e.g. 'Prefers short answers'.",
  signature: "{ content: string, kind?: 'preference'|'fact'|'project'|'person'|'instruction'|'routine'|'other', importance?: 1-5, replaces_id?: string }",
  params: z.object({
    content: z.string().min(2).max(600),
    kind: kind.optional(),
    importance: z.coerce.number().min(1).max(5).optional(),
    replaces_id: z.string().optional(),
  }),
  status: () => "שומר בזיכרון…",
  icon: "memory",
  async run(a, t) {
    const { memory, created } = await saveMemory(t.ctx, {
      content: a.content,
      kind: a.kind,
      importance: a.importance,
      source: "explicit",
      sourceMessageId: t.messageId,
      replaceId: a.replaces_id,
    });
    return { ok: true, data: { id: memory.id, created }, chip: { icon: "memory", text: created ? "נשמר בזיכרון" : "הזיכרון עודכן" } };
  },
});

export const searchMemoryTool = defineTool({
  name: "search_memory",
  description: "Search long-term memory for facts about the user beyond the ones already in your context.",
  signature: "{ query: string }",
  params: z.object({ query: z.string().min(1).max(300) }),
  status: () => "מחפש במידע ששמרת…",
  icon: "memory",
  async run(a, t) {
    const rows = await searchMemories(t.ctx, a.query, 12);
    return { ok: true, data: rows.map((m) => ({ id: m.id, kind: m.kind, content: m.content, saved: m.createdAt.toISOString().slice(0, 10) })) };
  },
});

export const forgetMemoryTool = defineTool({
  name: "forget_memory",
  description: "Remove memories the user asks you to forget. Pass memory ids from your context or from search_memory.",
  signature: "{ ids: string[] }",
  params: z.object({ ids: z.array(z.string()).min(1).max(20) }),
  status: () => "מעדכן את הזיכרון…",
  icon: "memory",
  async run(a, t) {
    const n = await forgetMemories(t.ctx, a.ids);
    return { ok: n > 0, data: { forgotten: n }, error: n ? undefined : "no matching memories", chip: n ? { icon: "memory", text: "נמחק מהזיכרון" } : undefined };
  },
});

export const searchHistoryTool = defineTool({
  name: "search_history",
  description:
    "Search the user's complete past conversations with you (everything ever said). Use for 'what did I tell you about…', 'what have I been working on', or when earlier context would help. Optional ISO dates narrow the range (e.g. last month).",
  signature: "{ query: string, from?: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', limit?: number }",
  params: z.object({
    query: z.string().max(300).default(""),
    from: z.string().optional(),
    to: z.string().optional(),
    limit: z.coerce.number().min(1).max(20).optional(),
  }),
  status: () => "מחפש בשיחות קודמות…",
  icon: "history",
  async run(a, t) {
    const date = (s?: string) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : undefined);
    const hits = await searchHistory(t.ctx, a.query, { limit: a.limit ?? 10, from: date(a.from), to: date(a.to) });
    return { ok: true, data: hits.map((h) => ({ at: h.at.slice(0, 16), who: h.role === "user" ? "user" : "jarvis", conversation: h.conversationTitle, text: h.snippet })) };
  },
});

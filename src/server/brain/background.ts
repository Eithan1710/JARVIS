import "server-only";
import { z } from "zod";
import { extractJson, generate } from "../ai/router";
import type { UserContext } from "../context";
import { logger } from "../logger";
import { getConversation, setTitle } from "../services/conversations";
import { forgetMemories, listMemories, saveMemory } from "../services/memory";
import { clip } from "../services/text";
import { EXTRACTOR_SYSTEM, TITLE_SYSTEM } from "./prompts";

const log = logger("background");

const extraction = z.object({
  add: z.array(z.object({ content: z.string().min(2).max(400), kind: z.string().optional(), importance: z.coerce.number().optional() })).max(5).default([]),
  update: z.array(z.object({ id: z.string(), content: z.string().min(2).max(400) })).max(5).default([]),
  forget: z.array(z.string()).max(5).default([]),
});

const KINDS = new Set(["preference", "fact", "project", "person", "instruction", "routine", "other"]);

/**
 * After each turn: decide whether the exchange contained something worth remembering long-term.
 * Runs on the cheap "light" route so it never competes with the Leader's quota.
 */
export async function extractMemories(ctx: UserContext, turn: { conversationId: string; messageId: string; userText: string; reply: string }) {
  if (turn.userText.trim().length < 12) return { skipped: true };
  const existing = await listMemories(ctx, 120);
  try {
    const res = await generate({
      role: "light",
      system: EXTRACTOR_SYSTEM,
      messages: [
        {
          role: "user",
          content: `Saved memories:\n${existing.map((m) => `- [${m.id}] ${m.content}`).join("\n") || "(none)"}\n\nLatest exchange:\nUSER: ${clip(turn.userText, 3000)}\nASSISTANT: ${clip(turn.reply, 1500)}`,
        },
      ],
      json: true,
      temperature: 0,
      maxOutputTokens: 800,
      audit: { ctx, purpose: "memory", conversationId: turn.conversationId, messageId: turn.messageId },
    });
    const parsed = extraction.safeParse(extractJson(res.text));
    if (!parsed.success) return { skipped: true };
    const ids = new Set(existing.map((m) => m.id));
    for (const a of parsed.data.add) {
      await saveMemory(ctx, {
        content: a.content,
        kind: (KINDS.has(a.kind ?? "") ? a.kind : "fact") as never,
        importance: a.importance,
        source: "extracted",
        sourceMessageId: turn.messageId,
      });
    }
    for (const u of parsed.data.update.filter((u) => ids.has(u.id))) {
      await saveMemory(ctx, { content: u.content, replaceId: u.id, source: "extracted", sourceMessageId: turn.messageId });
    }
    await forgetMemories(ctx, parsed.data.forget.filter((id) => ids.has(id)));
    return { added: parsed.data.add.length, updated: parsed.data.update.length, forgotten: parsed.data.forget.length };
  } catch (e) {
    log.warn("memory extraction failed", { error: e instanceof Error ? e.message.slice(0, 200) : "error" });
    return { skipped: true };
  }
}

/** Name a conversation after its first exchange. */
export async function ensureTitle(ctx: UserContext, conversationId: string, userText: string): Promise<string | null> {
  const conv = await getConversation(ctx, conversationId);
  if (!conv || conv.title) return null;
  let title = clip(userText.replace(/\s+/g, " "), 42);
  try {
    const res = await generate({
      role: "light",
      system: TITLE_SYSTEM,
      messages: [{ role: "user", content: clip(userText, 1000) }],
      temperature: 0.2,
      maxOutputTokens: 40,
      audit: { ctx, purpose: "title", conversationId },
    });
    const t = res.text.replace(/["'״`*#]/g, "").split("\n")[0].trim();
    if (t && t.length <= 60) title = t;
  } catch {
    /* keep the clipped fallback */
  }
  await setTitle(ctx, conversationId, title);
  return title;
}

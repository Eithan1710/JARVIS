import "server-only";
import type { StreamEvent } from "@/lib/protocol";
import { aiConfigured, aiErrorMessage } from "../ai/router";
import type { UserContext } from "../context";
import { logger } from "../logger";
import { appendMessage, resolveConversation } from "../services/conversations";
import { runLeader, type LeaderOutcome } from "./leader";

const log = logger("turn");

export interface TurnInput {
  conversationId?: string | null;
  text: string;
  inputMode: "text" | "voice";
}

export interface TurnResult {
  conversationId: string;
  userMessageId: string;
  assistantMessageId: string;
  reply: string;
  outcome: LeaderOutcome | null;
  isNewConversation: boolean;
}

/**
 * One user turn: persist the message, let the Leader work (streaming status), persist the reply
 * with everything it did. Background follow-ups (memory, title) are returned for the caller to
 * schedule after the response is sent.
 */
export async function runTurn(ctx: UserContext, input: TurnInput, emit: (e: StreamEvent) => void): Promise<TurnResult> {
  const conv = await resolveConversation(ctx, input.conversationId);
  const isNewConversation = conv.id !== input.conversationId;
  const userMsg = await appendMessage(ctx, { conversationId: conv.id, role: "user", content: input.text, inputMode: input.inputMode });
  emit({ type: "meta", conversationId: conv.id, userMessageId: userMsg.id });

  let outcome: LeaderOutcome | null = null;
  let reply: string;
  if (!aiConfigured()) {
    reply = "אני כאן, אבל עוד לא חיברו אותי למוח 🙂\nכדי שאוכל לענות צריך להגדיר בשרת מפתח `GEMINI_API_KEY` (חינמי, מ־Google AI Studio). ההודעה שלך נשמרה.";
  } else {
    try {
      outcome = await runLeader(ctx, { conversationId: conv.id, messageId: userMsg.id, text: input.text, voice: input.inputMode === "voice" }, emit);
      reply = outcome.reply;
    } catch (e) {
      log.warn("leader failed", { error: e instanceof Error ? e.message.slice(0, 200) : "error" });
      reply = aiErrorMessage(e);
    }
  }

  const saved = await appendMessage(ctx, {
    conversationId: conv.id,
    role: "assistant",
    content: reply,
    meta: {
      replyTo: userMsg.id,
      steps: outcome?.steps ?? [],
      actions: outcome?.actions ?? [],
      chips: outcome?.chips ?? [],
      provider: outcome?.provider ?? null,
      model: outcome?.model ?? null,
      rounds: outcome?.rounds ?? 0,
      tools: outcome?.toolsUsed ?? [],
    },
  });
  emit({ type: "reply", messageId: saved.id, text: reply, createdAt: saved.createdAt.toISOString() });
  return { conversationId: conv.id, userMessageId: userMsg.id, assistantMessageId: saved.id, reply, outcome, isNewConversation };
}

import { after, type NextRequest } from "next/server";
import { z } from "zod";
import type { StreamEvent } from "@/lib/protocol";
import { jsonError } from "@/server/api/handler";
import { ensureTitle, extractMemories } from "@/server/brain/background";
import { runTurn } from "@/server/brain/turn";
import { getUserContext, isValidTimezone, UnauthorizedError, type UserContext } from "@/server/context";
import { getDb } from "@/server/db/client";
import { users } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { errorInfo, logger } from "@/server/logger";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const log = logger("chat");

const body = z.object({
  conversationId: z.string().uuid().nullish(),
  text: z.string().trim().min(1).max(20_000),
  inputMode: z.enum(["text", "voice"]).default("text"),
  timezone: z.string().max(64).optional(),
});

/** One chat turn, streamed as newline-delimited JSON events (see src/lib/protocol.ts). */
export async function POST(req: NextRequest) {
  let ctx: UserContext;
  try {
    ctx = await getUserContext();
  } catch (e) {
    if (e instanceof UnauthorizedError) return jsonError(401, "unauthorized", "נדרשת כניסה מחדש");
    throw e;
  }
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "validation", "ההודעה ריקה או ארוכה מדי");
  const input = parsed.data;

  // Keep the user's timezone in sync with their device (reminders fire in local time).
  if (input.timezone && input.timezone !== ctx.timezone && isValidTimezone(input.timezone)) {
    const db = await getDb();
    await db.update(users).set({ timezone: input.timezone }).where(eq(users.id, ctx.userId));
    ctx = { ...ctx, timezone: input.timezone };
  }
  const user = ctx;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let open = true;
      const emit = (e: StreamEvent) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(`${JSON.stringify(e)}\n`));
        } catch {
          open = false;
        }
      };
      try {
        const result = await runTurn(user, { conversationId: input.conversationId, text: input.text, inputMode: input.inputMode }, emit);
        if (result.isNewConversation) {
          const title = await ensureTitle(user, result.conversationId, input.text).catch(() => null);
          if (title) emit({ type: "title", conversationId: result.conversationId, title });
        }
        const skipMemory = result.outcome?.toolsUsed.some((t) => t === "save_memory" || t === "forget_memory");
        if (!skipMemory && result.outcome) {
          const job = () => extractMemories(user, { conversationId: result.conversationId, messageId: result.userMessageId, userText: input.text, reply: result.reply });
          try {
            after(job);
          } catch {
            void job();
          }
        }
      } catch (e) {
        log.error("turn failed", errorInfo(e));
        emit({ type: "error", message: "משהו השתבש. נסה שוב בעוד רגע." });
      } finally {
        emit({ type: "done" });
        open = false;
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

import type { NextRequest } from "next/server";
import { z } from "zod";
import { getUserContext, UnauthorizedError } from "@/server/context";
import { jsonError } from "@/server/api/handler";
import { ask } from "@/server/ai/orchestrator";
import { errorInfo, logger } from "@/server/logger";

export const maxDuration = 60;
const log = logger("ask");

const body = z.object({ question: z.string().trim().min(1).max(2000), conversationId: z.string().uuid().nullish() });

/**
 * Streams NDJSON: {"type":"step",...} lines while the orchestrator works, then a final
 * {"type":"result",...} (or {"type":"error",...}).
 */
export async function POST(req: NextRequest) {
  let ctx;
  try {
    ctx = await getUserContext();
  } catch (e) {
    if (e instanceof UnauthorizedError) return jsonError(401, "unauthorized", "נדרשת כניסה מחדש");
    throw e;
  }
  const parsed = body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(400, "validation", "השאלה ריקה או ארוכה מדי");

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const res = await ask(ctx, parsed.data, (e) => send(e));
        send({ type: "result", conversationId: res.conversationId, message: res.message });
      } catch (e) {
        log.error("ask failed", errorInfo(e));
        send({ type: "error", message: "משהו השתבש בזמן הניתוח. נסה שוב." });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}

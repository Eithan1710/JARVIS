import { z } from "zod";
import { route } from "@/server/api/handler";
import { messagesSince, toChatMessage } from "@/server/services/conversations";

export const dynamic = "force-dynamic";

/** Proactive messages (reminders, habit nudges, goal check-ins) delivered since `since`. */
export const GET = route({ query: z.object({ since: z.string().datetime() }) }, async (ctx, { query }) => {
  const rows = await messagesSince(ctx, new Date(query.since));
  return { messages: rows.map((r) => ({ ...toChatMessage(r), conversationId: r.conversationId })), now: new Date().toISOString() };
});

import { z } from "zod";
import { notFound, route } from "@/server/api/handler";
import { archiveConversation, getConversation, listMessages, toChatMessage } from "@/server/services/conversations";

export const dynamic = "force-dynamic";

const query = z.object({ before: z.string().datetime().optional(), limit: z.coerce.number().min(1).max(200).optional() });

export const GET = route({ query }, async (ctx, { params, query }) => {
  const conv = await getConversation(ctx, params.id);
  if (!conv) throw notFound("השיחה");
  const rows = await listMessages(ctx, conv.id, { limit: query.limit ?? 80, before: query.before ? new Date(query.before) : undefined });
  return { conversation: { id: conv.id, title: conv.title }, messages: rows.map(toChatMessage), hasMore: rows.length === (query.limit ?? 80) };
});

/** Hides the conversation from the list. History is kept (and stays searchable). */
export const DELETE = route({}, async (ctx, { params }) => {
  const conv = await getConversation(ctx, params.id);
  if (!conv) throw notFound("השיחה");
  await archiveConversation(ctx, conv.id);
  return { ok: true };
});

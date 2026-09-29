import { route } from "@/server/api/handler";
import { deleteConversation, getConversation } from "@/server/ai/orchestrator";

export const GET = route({}, (ctx, { params }) => getConversation(ctx, params.id));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteConversation(ctx, params.id);
  return { ok: true };
});

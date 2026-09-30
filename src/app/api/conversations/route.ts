import { route } from "@/server/api/handler";
import { listConversations } from "@/server/services/conversations";

export const dynamic = "force-dynamic";

export const GET = route({}, async (ctx) => ({ conversations: await listConversations(ctx) }));

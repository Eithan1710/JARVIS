import { route } from "@/server/api/handler";
import { listConversations } from "@/server/ai/orchestrator";

export const GET = route({}, (ctx) => listConversations(ctx));

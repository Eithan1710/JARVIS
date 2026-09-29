import { route } from "@/server/api/handler";
import { refreshInsights } from "@/server/services/insights";

export const maxDuration = 60;
export const POST = route({}, async (ctx) => ({ found: await refreshInsights(ctx) }));

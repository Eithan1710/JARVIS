import { z } from "zod";
import { route } from "@/server/api/handler";
import { listInsights } from "@/server/services/insights";

export const GET = route({ query: z.object({ all: z.string().optional() }) }, (ctx, { query }) => listInsights(ctx, { includeDismissed: Boolean(query.all) }));

import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { ensureDailyBrief, narrateDailyBrief } from "@/server/services/reports";

export const maxDuration = 60;
export const POST = route({ body: z.object({ date: zDate.optional() }) }, async (ctx, { body }) => narrateDailyBrief(ctx, await ensureDailyBrief(ctx, body.date ?? ctx.today)));

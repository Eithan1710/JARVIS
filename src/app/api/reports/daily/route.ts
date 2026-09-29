import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { ensureDailyBrief } from "@/server/services/reports";

export const GET = route({ query: z.object({ date: zDate.optional() }) }, (ctx, { query }) => ensureDailyBrief(ctx, query.date ?? ctx.today));

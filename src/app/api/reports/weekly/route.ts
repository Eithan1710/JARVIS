import { z } from "zod";
import { startOfWeek } from "@/lib/dates";
import { route, zDate } from "@/server/api/handler";
import { ensureWeeklyReview } from "@/server/services/reports";

export const maxDuration = 60;
export const GET = route({ query: z.object({ week: zDate.optional() }) }, (ctx, { query }) => ensureWeeklyReview(ctx, startOfWeek(query.week ?? ctx.today)));

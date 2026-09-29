import { z } from "zod";
import { startOfWeek } from "@/lib/dates";
import { route, zDate } from "@/server/api/handler";
import { ensureWeeklyReview, narrateWeeklyReview } from "@/server/services/reports";

export const maxDuration = 60;
export const POST = route({ body: z.object({ week: zDate.optional() }) }, async (ctx, { body }) => narrateWeeklyReview(ctx, await ensureWeeklyReview(ctx, startOfWeek(body.week ?? ctx.today))));

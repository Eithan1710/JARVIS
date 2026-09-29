import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { createHabit, habitInput, habitSummaries, listHabits } from "@/server/services/habits";

export const GET = route({ query: z.object({ date: zDate.optional(), all: z.string().optional() }) }, async (ctx, { query }) => {
  if (query.all) return listHabits(ctx, { includeArchived: true });
  return habitSummaries(ctx, { date: query.date });
});

export const POST = route({ body: habitInput }, (ctx, { body }) => createHabit(ctx, body));

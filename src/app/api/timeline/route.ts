import { z } from "zod";
import { addDays } from "@/lib/dates";
import { route, zDate } from "@/server/api/handler";
import { timeline } from "@/server/services/timeline";

export const GET = route({ query: z.object({ from: zDate.optional(), to: zDate.optional() }) }, (ctx, { query }) => {
  const to = query.to ?? ctx.today;
  const from = query.from ?? addDays(to, -13);
  return timeline(ctx, from, to);
});

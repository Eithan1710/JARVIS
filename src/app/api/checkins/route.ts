import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { checkinInput, getCheckin, listCheckins, upsertCheckin } from "@/server/services/journal";

export const GET = route({ query: z.object({ date: zDate.optional(), from: zDate.optional(), to: zDate.optional() }) }, async (ctx, { query }) => {
  if (query.from && query.to) return listCheckins(ctx, query.from, query.to);
  return getCheckin(ctx, query.date ?? ctx.today);
});
export const PUT = route({ body: checkinInput }, (ctx, { body }) => upsertCheckin(ctx, body));

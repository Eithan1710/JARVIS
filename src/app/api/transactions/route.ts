import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { addTransaction, listTransactions, spendingByCategory, transactionInput } from "@/server/services/data";

export const GET = route({ query: z.object({ from: zDate.optional(), to: zDate.optional(), category: z.string().optional(), summary: z.string().optional() }) }, async (ctx, { query }) => {
  if (query.summary && query.from && query.to) return spendingByCategory(ctx, query.from, query.to);
  return listTransactions(ctx, query);
});
export const POST = route({ body: transactionInput }, (ctx, { body }) => addTransaction(ctx, body));

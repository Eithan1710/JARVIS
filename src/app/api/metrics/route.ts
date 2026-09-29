import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { addMetric, listMetrics, metricInput } from "@/server/services/data";

export const GET = route(
  { query: z.object({ from: zDate.optional(), to: zDate.optional(), keys: z.string().optional(), source: z.string().optional(), limit: z.coerce.number().int().min(1).max(2000).optional() }) },
  (ctx, { query }) => listMetrics(ctx, { ...query, keys: query.keys?.split(",").filter(Boolean) }),
);
export const POST = route({ body: metricInput }, (ctx, { body }) => addMetric(ctx, body));

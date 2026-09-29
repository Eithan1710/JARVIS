import { route } from "@/server/api/handler";
import { createCustomMetric, customMetricDefs, customMetricInput } from "@/server/services/data";

export const GET = route({}, (ctx) => customMetricDefs(ctx));
export const POST = route({ body: customMetricInput }, (ctx, { body }) => createCustomMetric(ctx, body));

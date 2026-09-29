import { route, notFound } from "@/server/api/handler";
import { deleteMetric } from "@/server/services/data";
import { metricProvenance } from "@/server/services/system";

export const GET = route({}, async (ctx, { params }) => {
  const p = await metricProvenance(ctx, params.id);
  if (!p) throw notFound("הנתון");
  return p;
});
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteMetric(ctx, params.id);
  return { ok: true };
});

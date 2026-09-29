import { route } from "@/server/api/handler";
import { deleteExperiment, getExperiment } from "@/server/services/experiments";

export const GET = route({}, (ctx, { params }) => getExperiment(ctx, params.id));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteExperiment(ctx, params.id);
  return { ok: true };
});

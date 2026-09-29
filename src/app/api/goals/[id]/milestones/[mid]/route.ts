import { z } from "zod";
import { route } from "@/server/api/handler";
import { deleteMilestone, setMilestone } from "@/server/services/goals";

export const PATCH = route({ body: z.object({ done: z.boolean() }) }, (ctx, { params, body }) => setMilestone(ctx, params.id, params.mid, body.done));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteMilestone(ctx, params.id, params.mid);
  return { ok: true };
});

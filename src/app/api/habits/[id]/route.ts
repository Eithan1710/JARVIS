import { z } from "zod";
import { route } from "@/server/api/handler";
import { deleteHabit, habitDetail, habitPatch, updateHabit } from "@/server/services/habits";

export const GET = route({ query: z.object({ days: z.coerce.number().int().min(7).max(1100).optional() }) }, (ctx, { params, query }) => habitDetail(ctx, params.id, query.days));
export const PATCH = route({ body: habitPatch }, (ctx, { params, body }) => updateHabit(ctx, params.id, body));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteHabit(ctx, params.id);
  return { ok: true };
});

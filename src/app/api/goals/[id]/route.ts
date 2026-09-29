import { route } from "@/server/api/handler";
import { deleteGoal, goalPatch, goalView, updateGoal } from "@/server/services/goals";

export const GET = route({}, (ctx, { params }) => goalView(ctx, params.id));
export const PATCH = route({ body: goalPatch }, (ctx, { params, body }) => updateGoal(ctx, params.id, body));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteGoal(ctx, params.id);
  return { ok: true };
});

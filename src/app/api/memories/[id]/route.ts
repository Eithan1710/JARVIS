import { route } from "@/server/api/handler";
import { deleteMemory, memoryPatch, updateMemory } from "@/server/services/memory";

export const PATCH = route({ body: memoryPatch }, (ctx, { params, body }) => updateMemory(ctx, params.id, body));
export const DELETE = route({}, async (ctx, { params }) => {
  await deleteMemory(ctx, params.id);
  return { ok: true };
});

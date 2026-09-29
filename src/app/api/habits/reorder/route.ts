import { z } from "zod";
import { route } from "@/server/api/handler";
import { reorderHabits } from "@/server/services/habits";

export const POST = route({ body: z.object({ ids: z.array(z.string().uuid()).max(100) }) }, async (ctx, { body }) => {
  await reorderHabits(ctx, body.ids);
  return { ok: true };
});

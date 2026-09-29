import { z } from "zod";
import { route, badRequest } from "@/server/api/handler";
import { eraseAll } from "@/server/services/system";

export const POST = route({ body: z.object({ confirm: z.string() }) }, async (ctx, { body }) => {
  if (body.confirm.trim() !== "מחק הכול") throw badRequest("כדי למחוק צריך להקליד בדיוק: מחק הכול");
  await eraseAll(ctx);
  return { ok: true };
});

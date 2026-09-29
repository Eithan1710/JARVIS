import { z } from "zod";
import { route } from "@/server/api/handler";
import { recordNotificationEvent } from "@/server/notifications/service";

export const POST = route({ body: z.object({ type: z.enum(["clicked", "dismissed", "read"]) }) }, async (ctx, { params, body }) => {
  await recordNotificationEvent(ctx, params.id, body.type);
  return { ok: true };
});

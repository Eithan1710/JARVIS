import { route } from "@/server/api/handler";
import { markAllRead } from "@/server/notifications/service";

export const POST = route({}, async (ctx) => {
  await markAllRead(ctx);
  return { ok: true };
});

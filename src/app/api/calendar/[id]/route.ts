import { route } from "@/server/api/handler";
import { deleteCalendarEvent } from "@/server/services/data";

export const DELETE = route({}, async (ctx, { params }) => {
  await deleteCalendarEvent(ctx, params.id);
  return { ok: true };
});

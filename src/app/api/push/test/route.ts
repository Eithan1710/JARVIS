import { route, ApiError } from "@/server/api/handler";
import { pushConfigured, sendPushToUser } from "@/server/notifications/push";

export const POST = route({}, async (ctx) => {
  if (!pushConfigured()) throw new ApiError(503, "push_not_configured", "התראות Push לא הוגדרו בשרת (חסרים מפתחות VAPID).");
  const delivered = await sendPushToUser(ctx.userId, { id: "test", title: "NOVA", body: "התראות עובדות 🎉", url: "/settings", tag: "test" });
  return { delivered };
});

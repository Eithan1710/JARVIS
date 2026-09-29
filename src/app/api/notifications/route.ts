import { route } from "@/server/api/handler";
import { listNotifications } from "@/server/notifications/service";

export const GET = route({}, (ctx) => listNotifications(ctx));

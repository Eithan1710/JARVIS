import { route } from "@/server/api/handler";
import { habitLogInput, logHabit } from "@/server/services/habits";

export const POST = route({ body: habitLogInput }, (ctx, { params, body }) => logHabit(ctx, params.id, body));

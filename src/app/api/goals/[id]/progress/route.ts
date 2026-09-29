import { z } from "zod";
import { route } from "@/server/api/handler";
import { addGoalProgress } from "@/server/services/goals";

export const POST = route({ body: z.object({ value: z.number().finite(), note: z.string().max(300).nullish() }) }, (ctx, { params, body }) => addGoalProgress(ctx, params.id, body.value, body.note));

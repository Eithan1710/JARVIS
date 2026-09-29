import { z } from "zod";
import { route, zDate } from "@/server/api/handler";
import { addMilestone } from "@/server/services/goals";

export const POST = route({ body: z.object({ title: z.string().trim().min(1).max(120), dueDate: zDate.nullish() }) }, (ctx, { params, body }) => addMilestone(ctx, params.id, body.title, body.dueDate));

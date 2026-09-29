import { route } from "@/server/api/handler";
import { createGoal, goalInput, listGoals } from "@/server/services/goals";

export const GET = route({}, (ctx) => listGoals(ctx));
export const POST = route({ body: goalInput }, (ctx, { body }) => createGoal(ctx, body));

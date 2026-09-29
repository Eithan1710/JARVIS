import { route } from "@/server/api/handler";
import { createExperiment, experimentInput, listExperiments } from "@/server/services/experiments";

export const GET = route({}, (ctx) => listExperiments(ctx));
export const POST = route({ body: experimentInput }, (ctx, { body }) => createExperiment(ctx, body));

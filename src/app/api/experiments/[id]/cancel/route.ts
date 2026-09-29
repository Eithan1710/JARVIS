import { route } from "@/server/api/handler";
import { cancelExperiment } from "@/server/services/experiments";

export const POST = route({}, (ctx, { params }) => cancelExperiment(ctx, params.id));

import { route } from "@/server/api/handler";
import { syncIntegration } from "@/server/integrations/service";

export const maxDuration = 60;
export const POST = route({}, (ctx, { params }) => syncIntegration(ctx, params.id));

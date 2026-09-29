import { route } from "@/server/api/handler";
import { regenerateIngestToken } from "@/server/integrations/service";

export const POST = route({}, async (ctx, { params }) => ({ token: await regenerateIngestToken(ctx, params.id) }));

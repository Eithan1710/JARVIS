import { z } from "zod";
import { route } from "@/server/api/handler";
import { disconnectIntegration } from "@/server/integrations/service";

export const DELETE = route({ query: z.object({ purge: z.string().optional() }) }, async (ctx, { params, query }) => {
  await disconnectIntegration(ctx, params.id, query.purge === "1");
  return { ok: true };
});

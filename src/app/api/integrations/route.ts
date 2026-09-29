import { z } from "zod";
import { route } from "@/server/api/handler";
import { INTEGRATIONS } from "@/server/integrations/registry";
import { connectIntegration, listIntegrations } from "@/server/integrations/service";

export const GET = route({}, async (ctx) => ({
  catalog: INTEGRATIONS.map(({ sync, ...d }) => ({ ...d, pull: Boolean(sync) })),
  connected: await listIntegrations(ctx),
}));

export const maxDuration = 60;
export const POST = route({ body: z.object({ provider: z.string().max(40), values: z.record(z.string(), z.unknown()).default({}) }) }, (ctx, { body }) => connectIntegration(ctx, body.provider, body.values));

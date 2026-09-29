import { z } from "zod";
import { route } from "@/server/api/handler";
import { analyzeExperiment, summarizeExperiment } from "@/server/services/experiments";

export const maxDuration = 60;
export const POST = route({ body: z.object({ summarize: z.boolean().optional() }) }, async (ctx, { params, body }) => {
  if (body.summarize) {
    const summary = await summarizeExperiment(ctx, params.id);
    const result = await analyzeExperiment(ctx, params.id);
    return { result, summary };
  }
  return { result: await analyzeExperiment(ctx, params.id) };
});

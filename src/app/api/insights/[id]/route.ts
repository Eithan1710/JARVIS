import { z } from "zod";
import { route } from "@/server/api/handler";
import { getInsight, setInsightStatus } from "@/server/services/insights";

export const GET = route({}, async (ctx, { params }) => {
  const res = await getInsight(ctx, params.id);
  if (res.insight.status === "new") await setInsightStatus(ctx, params.id, "seen");
  return res;
});
export const PATCH = route({ body: z.object({ status: z.enum(["seen", "pinned", "dismissed"]) }) }, (ctx, { params, body }) => setInsightStatus(ctx, params.id, body.status));

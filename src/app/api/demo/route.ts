import { route } from "@/server/api/handler";
import { hasDemoData, loadDemoData, removeDemoData } from "@/server/services/demo";

export const maxDuration = 60;
export const GET = route({}, async (ctx) => ({ active: await hasDemoData(ctx) }));
export const POST = route({}, async (ctx) => {
  if (await hasDemoData(ctx)) return { ok: true, already: true };
  return loadDemoData(ctx);
});
export const DELETE = route({}, async (ctx) => {
  await removeDemoData(ctx);
  return { ok: true };
});

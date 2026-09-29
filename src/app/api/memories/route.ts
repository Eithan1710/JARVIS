import { route } from "@/server/api/handler";
import { createMemory, listMemories, memoryInput } from "@/server/services/memory";

export const GET = route({}, (ctx) => listMemories(ctx, { status: ["active", "proposed", "archived"] }));
export const POST = route({ body: memoryInput }, (ctx, { body }) => createMemory(ctx, body));

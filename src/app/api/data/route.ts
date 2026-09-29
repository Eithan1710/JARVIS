import { route } from "@/server/api/handler";
import { dataInventory } from "@/server/services/system";

export const GET = route({}, (ctx) => dataInventory(ctx));

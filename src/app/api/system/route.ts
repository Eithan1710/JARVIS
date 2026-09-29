import { route } from "@/server/api/handler";
import { systemStatus } from "@/server/services/system";

export const GET = route({}, (ctx) => systemStatus(ctx));

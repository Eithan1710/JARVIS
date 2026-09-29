import { route } from "@/server/api/handler";
import { dashboard } from "@/server/services/system";

export const GET = route({}, (ctx) => dashboard(ctx));

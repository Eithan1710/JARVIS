import { route } from "@/server/api/handler";
import { settingsPatchSchema } from "@/lib/settings";
import { updateSettings } from "@/server/services/system";

export const GET = route({}, async (ctx) => ({ displayName: ctx.displayName, timezone: ctx.timezone, settings: ctx.settings }));
export const PATCH = route({ body: settingsPatchSchema }, (ctx, { body }) => updateSettings(ctx, body));

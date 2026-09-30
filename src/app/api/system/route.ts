import { route } from "@/server/api/handler";
import { providerStatus } from "@/server/ai/router";
import { env } from "@/server/env";
import { pushConfigured } from "@/server/notifications/push";

export const dynamic = "force-dynamic";

/** Minimal status for the client: push key (public by design) and whether JARVIS has a brain. */
export const GET = route({}, async (ctx) => {
  const providers = await providerStatus();
  return {
    push: { configured: pushConfigured(), publicKey: pushConfigured() ? env().VAPID_PUBLIC_KEY ?? null : null },
    ai: { configured: providers.some((p) => p.configured), providers: providers.map((p) => ({ id: p.id, label: p.label, configured: p.configured, coolingDown: p.coolingDown })) },
    timezone: ctx.timezone,
    name: ctx.displayName,
  };
});

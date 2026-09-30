import "server-only";
import { and, eq } from "drizzle-orm";
import type { UserContext } from "../context";
import { decryptJson } from "../crypto";
import { getDb } from "../db/client";
import { connections } from "../db/schema";
import { env } from "../env";

/**
 * Connections = external data sources and services JARVIS can reach on the user's behalf.
 * A definition says what it is and how to find its credentials: a per-user encrypted secret in
 * `connections` (OAuth tokens later), falling back to a server env key for the single-owner MVP.
 * Tools declare which connection they need; adding e.g. Google Calendar means one definition
 * here + its OAuth callback + tools — nothing in the Leader changes.
 */
export interface ConnectionDefinition {
  type: string;
  label: string;
  /** What JARVIS can do with it (shown to the Leader). */
  capability: string;
  /** Works without any credentials (public data)? */
  public?: boolean;
  envSecret?: () => string | undefined;
}

export const CONNECTIONS: ConnectionDefinition[] = [
  {
    type: "github",
    label: "GitHub",
    capability: "read public repositories, READMEs, files and a user's recent activity (private repos when a token is set)",
    public: true,
    envSecret: () => env().GITHUB_TOKEN,
  },
  {
    type: "web_search",
    label: "Web search",
    capability: "search the web (Tavily when configured, otherwise Wikipedia)",
    public: true,
    envSecret: () => env().TAVILY_API_KEY,
  },
  { type: "web_page", label: "Web pages", capability: "read the text of a public web page by URL", public: true },
  // Planned — need OAuth apps / device integrations (see docs/ARCHITECTURE.md):
  // google_calendar, gmail, google_drive, spotify, apple_health (iOS Shortcut webhook)
];

export async function connectionSecret(ctx: UserContext, type: string): Promise<string | undefined> {
  try {
    const db = await getDb();
    const [row] = await db
      .select({ secretEnc: connections.secretEnc })
      .from(connections)
      .where(and(eq(connections.userId, ctx.userId), eq(connections.type, type), eq(connections.status, "active")))
      .limit(1);
    if (row?.secretEnc) {
      const s = decryptJson<{ token?: string }>(row.secretEnc);
      if (s.token) return s.token;
    }
  } catch {
    /* fall back to env */
  }
  return CONNECTIONS.find((c) => c.type === type)?.envSecret?.();
}

export async function connectionSummary(ctx: UserContext) {
  const out: { type: string; label: string; capability: string; status: "connected" | "public" }[] = [];
  for (const c of CONNECTIONS) {
    const secret = c.envSecret ? await connectionSecret(ctx, c.type) : undefined;
    out.push({ type: c.type, label: c.label, capability: c.capability, status: secret ? "connected" : "public" });
  }
  return out;
}

import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { todayIn, type ISODate } from "@/lib/dates";
import { parseSettings, type Settings } from "@/lib/settings";
import { authRequired, SESSION_COOKIE, verifySessionToken } from "./auth/session";
import { getDb } from "./db/client";
import { users } from "./db/schema";

/**
 * The single-user identity/context layer. Every service receives a UserContext rather than
 * reaching for "the user" globally, so adding real multi-user auth later only changes how the
 * context is resolved — not the services.
 */
export interface UserContext {
  userId: string;
  displayName: string;
  timezone: string;
  settings: Settings;
  now: Date;
  today: ISODate;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

type G = { __novaOwner?: Promise<string> };
const g = globalThis as unknown as G;

/** Returns the id of the (single) owner, creating the row on first run. */
export function ensureOwner(): Promise<string> {
  if (!g.__novaOwner) {
    g.__novaOwner = (async () => {
      const db = await getDb();
      const existing = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
      if (existing[0]) return existing[0].id;
      const [row] = await db.insert(users).values({}).returning({ id: users.id });
      return row.id;
    })().catch((e) => {
      g.__novaOwner = undefined;
      throw e;
    });
  }
  return g.__novaOwner;
}

export async function loadContext(userId: string, now = new Date()): Promise<UserContext> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new UnauthorizedError();
  return {
    userId: row.id,
    displayName: row.displayName,
    timezone: row.timezone,
    settings: parseSettings(row.settings),
    now,
    today: todayIn(row.timezone, now),
  };
}

/** Resolve the current request's user. Memoised per request. */
export const getUserContext = cache(async (): Promise<UserContext> => {
  if (!authRequired()) return loadContext(await ensureOwner());
  const jar = await cookies();
  const session = await verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!session) throw new UnauthorizedError();
  return loadContext(session.uid);
});

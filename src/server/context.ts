import "server-only";
import { asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { todayIn, type ISODate } from "@/lib/dates";
import { authRequired, SESSION_COOKIE, verifySessionToken } from "./auth/session";
import { getDb } from "./db/client";
import { users } from "./db/schema";
import { env } from "./env";

/**
 * The identity layer. Every service receives a UserContext rather than reaching for "the user"
 * globally, so moving from the single-owner passcode to real multi-user auth only changes how
 * the context is resolved — never the services, tools or queries (all scoped by userId).
 */
export interface UserContext {
  userId: string;
  displayName: string;
  timezone: string;
  settings: Record<string, unknown>;
  now: Date;
  today: ISODate;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("unauthorized");
  }
}

type G = { __jarvisOwner?: Promise<string> };
const g = globalThis as unknown as G;

/** Returns the id of the owner, creating the row on first run. */
export function ensureOwner(): Promise<string> {
  if (!g.__jarvisOwner) {
    g.__jarvisOwner = (async () => {
      const db = await getDb();
      const existing = await db.select({ id: users.id }).from(users).orderBy(asc(users.createdAt)).limit(1);
      if (existing[0]) return existing[0].id;
      const [row] = await db.insert(users).values({ timezone: env().DEFAULT_TIMEZONE }).returning({ id: users.id });
      return row.id;
    })().catch((e) => {
      g.__jarvisOwner = undefined;
      throw e;
    });
  }
  return g.__jarvisOwner;
}

export function resetOwnerForTests() {
  g.__jarvisOwner = undefined;
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export async function loadContext(userId: string, now = new Date()): Promise<UserContext> {
  const db = await getDb();
  const [row] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!row) throw new UnauthorizedError();
  const timezone = isValidTimezone(row.timezone) ? row.timezone : env().DEFAULT_TIMEZONE;
  return {
    userId: row.id,
    displayName: row.displayName,
    timezone,
    settings: row.settings ?? {},
    now,
    today: todayIn(timezone, now),
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

import "server-only";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { logger } from "../logger";
import { runMigrations } from "./migrate";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const log = logger("db");

type GlobalDb = { __jarvisDb?: Promise<DB> };
const g = globalThis as unknown as GlobalDb;

async function createDb(): Promise<DB> {
  const { DATABASE_URL, PGLITE_DIR, NODE_ENV } = env();

  if (DATABASE_URL) {
    const client = postgres(DATABASE_URL, {
      // Required for Supabase / PgBouncer transaction pooling.
      prepare: false,
      max: NODE_ENV === "production" ? 3 : 5,
      idle_timeout: 20,
      connect_timeout: 15,
      onnotice: () => {},
    });
    const applied = await runMigrations({
      exec: (q) => client.unsafe(q).simple(),
      query: async (q) => (await client.unsafe(q)) as unknown as { name: string }[],
      transaction: async (fn) => {
        await client.begin(async (tx) => {
          await fn(
            (q) => tx.unsafe(q).simple(),
            async (q) => (await tx.unsafe(q)) as unknown as { name: string }[],
          );
        });
      },
    });
    if (applied) log.info("migrations applied", { count: applied });
    return drizzlePg(client, { schema });
  }

  if (NODE_ENV === "production") throw new Error("DATABASE_URL is required in production");

  // Local development / tests: embedded Postgres (WASM). Same SQL, zero setup.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = PGLITE_DIR === "memory" ? undefined : PGLITE_DIR;
  if (dir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }
  const client = dir ? new PGlite(dir) : new PGlite();
  await runMigrations({
    exec: (q) => client.exec(q),
    query: async (q) => (await client.query<{ name: string }>(q)).rows,
    transaction: async (fn) => {
      await client.transaction(async (tx) => {
        await fn(
          (q) => tx.exec(q),
          async (q) => (await tx.query<{ name: string }>(q)).rows,
        );
      });
    },
  });
  log.info("using embedded PGlite database", { dir: dir ?? "memory" });
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__jarvisDb) {
    g.__jarvisDb = createDb().catch((err) => {
      g.__jarvisDb = undefined;
      throw err;
    });
  }
  return g.__jarvisDb;
}

/** Test hook: drop the cached connection so the next getDb() starts fresh. */
export function resetDbForTests() {
  g.__jarvisDb = undefined;
}

export { schema };

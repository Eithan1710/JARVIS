import "server-only";
import { drizzle as drizzlePg, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "../env";
import { logger } from "../logger";
import * as schema from "./schema";

export type DB = PostgresJsDatabase<typeof schema>;

const log = logger("db");

type GlobalDb = { __novaDb?: Promise<DB> };
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
    return drizzlePg(client, { schema });
  }

  if (NODE_ENV === "production") {
    throw new Error("DATABASE_URL is required in production");
  }

  // Local development / tests: embedded Postgres (WASM). Same SQL, zero setup.
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle: drizzlePglite } = await import("drizzle-orm/pglite");
  const dir = PGLITE_DIR === "memory" ? undefined : PGLITE_DIR;
  if (dir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  }
  const client = dir ? new PGlite(dir) : new PGlite();
  const { runMigrations } = await import("./migrate");
  await runMigrations(async (sqlText) => {
    await client.exec(sqlText);
  }, async (q) => (await client.query<{ name: string }>(q)).rows);
  log.info("using embedded PGlite database", { dir: dir ?? "memory" });
  return drizzlePglite(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (!g.__novaDb) {
    g.__novaDb = createDb().catch((err) => {
      g.__novaDb = undefined;
      throw err;
    });
  }
  return g.__novaDb;
}

export { schema };

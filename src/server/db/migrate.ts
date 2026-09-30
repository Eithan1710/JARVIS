import "server-only";
import { migrations } from "./migrations";

/**
 * Tiny migrator shared by Postgres (Supabase) and the embedded dev database.
 * Applied migration names are recorded in jarvis._migrations. Each migration runs in its own
 * transaction, serialized with an advisory lock so concurrent cold starts can't race.
 */
export interface MigrationDriver {
  query(sql: string): Promise<{ name: string }[]>;
  /** Run fn inside a transaction; `exec` runs a multi-statement SQL string in it. */
  transaction(fn: (exec: (sql: string) => Promise<unknown>, query: (sql: string) => Promise<{ name: string }[]>) => Promise<void>): Promise<void>;
  exec(sql: string): Promise<unknown>;
}

const BOOTSTRAP = `CREATE SCHEMA IF NOT EXISTS jarvis; CREATE TABLE IF NOT EXISTS jarvis._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`;

export async function runMigrations(db: MigrationDriver): Promise<number> {
  await db.exec(BOOTSTRAP);
  const applied = new Set((await db.query(`SELECT name FROM jarvis._migrations`)).map((r) => r.name));
  let count = 0;
  for (const m of migrations.filter((x) => !applied.has(x.name))) {
    await db.transaction(async (exec, query) => {
      await exec(`SELECT pg_advisory_xact_lock(4747001)`);
      const again = await query(`SELECT name FROM jarvis._migrations WHERE name = '${m.name}'`);
      if (again.length) return;
      await exec(m.sql);
      await exec(`INSERT INTO jarvis._migrations(name) VALUES ('${m.name}')`);
      count++;
    });
  }
  return count;
}

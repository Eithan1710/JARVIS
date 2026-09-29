import "server-only";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Tiny, dependency-free migrator shared by the embedded dev database.
 * Production uses scripts/migrate.mjs, which follows the exact same rules:
 *   - files in /drizzle named NNNN_*.sql, applied in order
 *   - statements split on drizzle-kit's "--> statement-breakpoint"
 *   - applied names recorded in nova._migrations
 */
export async function runMigrations(
  exec: (sql: string) => Promise<void>,
  query: (sql: string) => Promise<{ name: string }[]>,
) {
  await exec(`CREATE SCHEMA IF NOT EXISTS nova; CREATE TABLE IF NOT EXISTS nova._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
  const applied = new Set((await query(`SELECT name FROM nova._migrations`)).map((r) => r.name));
  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (applied.has(name)) continue;
    const sqlText = await readFile(path.join(dir, file), "utf8");
    const body = sqlText
      .split("--> statement-breakpoint")
      .map((s) => s.trim().replace(/;\s*$/, ""))
      .filter(Boolean)
      .join(";\n");
    await exec(`BEGIN;\n${body};\nINSERT INTO nova._migrations(name) VALUES ('${name.replace(/'/g, "''")}');\nCOMMIT;`);
  }
}

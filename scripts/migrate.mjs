// Applies SQL migrations in ./drizzle to DATABASE_URL (same rules as the embedded dev DB).
// Usage: DATABASE_URL=... node scripts/migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
try {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS nova; CREATE TABLE IF NOT EXISTS nova._migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now());`);
  const applied = new Set((await sql`SELECT name FROM nova._migrations`).map((r) => r.name));
  const dir = path.join(process.cwd(), "drizzle");
  const files = (await readdir(dir)).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  for (const file of files) {
    const name = file.replace(/\.sql$/, "");
    if (applied.has(name)) continue;
    const text = await readFile(path.join(dir, file), "utf8");
    const statements = text.split("--> statement-breakpoint").map((s) => s.trim()).filter(Boolean);
    await sql.begin(async (tx) => {
      for (const s of statements) await tx.unsafe(s);
      await tx`INSERT INTO nova._migrations(name) VALUES (${name})`;
    });
    console.log(`applied ${name}`);
  }
  console.log("migrations up to date");
} finally {
  await sql.end();
}

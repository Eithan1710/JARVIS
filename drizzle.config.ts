import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  schemaFilter: ["nova"],
  migrations: { prefix: "index" },
  dbCredentials: { url: process.env.DATABASE_URL ?? "postgres://localhost/nova" },
});

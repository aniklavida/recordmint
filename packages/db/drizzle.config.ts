import { defineConfig } from "drizzle-kit";

/**
 * No tables exist yet — this card wires the connection, the migration
 * runner and the health check. Schema lands with the first feature that
 * needs one (roadmap step 4, accounts and workspaces), and `pnpm db:generate`
 * is what turns it into a committed SQL migration under ./migrations.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://recordmint:recordmint@localhost:5432/recordmint",
  },
});

import { defineConfig } from "drizzle-kit";

/**
 * `pnpm db:generate` turns ./src/schema into a committed SQL migration
 * under ./migrations.
 *
 * That script runs with `NODE_OPTIONS="--require tsx/cjs"` rather than
 * bare `drizzle-kit generate`. drizzle-kit loads this TS schema with
 * esbuild-register, which transpiles each required file individually
 * without rewriting import specifiers — so a source file that imports a
 * sibling as "./users.js" (required everywhere in this package, since
 * Node's real ESM loader needs that exact extension once tsc has
 * compiled it to "./users.js" sitting next to "./index.js" in dist/)
 * fails to resolve, because no literal users.js exists next to the
 * un-compiled users.ts. Preloading tsx's CJS loader — which does
 * understand that NodeNext-style mapping — fixes resolution for
 * drizzle-kit's schema-loading pass without changing how the package
 * imports anything at real runtime.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://recordmint:recordmint@localhost:5432/recordmint",
  },
});

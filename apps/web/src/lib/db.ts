import { createDb, loadDbConfigFromEnv, type Db } from "@recordmint/db";

/**
 * One connection pool per process (packages/db's own client.ts comment).
 * Next.js route handlers run inside the same long-lived Node process in
 * both `next dev` and `next start`, so a module-scoped singleton here is
 * the pool — not one connection per request, which is what would fall
 * over first under any real concurrency.
 */
let db: Db | undefined;

export function getDb(): Db {
  db ??= createDb(loadDbConfigFromEnv());
  return db;
}

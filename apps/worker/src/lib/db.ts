import { createDb, loadDbConfigFromEnv, type Db } from "@recordmint/db";

let db: Db | undefined;

/** One connection pool for the whole worker process — every job handler shares it rather than opening its own. */
export function getDb(): Db {
  db ??= createDb(loadDbConfigFromEnv());
  return db;
}

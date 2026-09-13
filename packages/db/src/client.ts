import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema/index.js";

export interface DbConfig {
  connectionString: string;
}

export function loadDbConfigFromEnv(env: NodeJS.ProcessEnv = process.env): DbConfig {
  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return { connectionString };
}

export interface Db {
  sql: Sql;
  orm: PostgresJsDatabase<typeof schema>;
}

/** One connection pool per process. `apps/web` and `apps/worker` each call this once at startup. */
export function createDb(config: DbConfig): Db {
  const sql = postgres(config.connectionString);
  const orm = drizzle(sql, { schema });
  return { sql, orm };
}

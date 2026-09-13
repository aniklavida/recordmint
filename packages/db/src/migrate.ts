import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createDb, loadDbConfigFromEnv } from "./client.js";

// Built via path.join rather than `new URL("../migrations", import.meta.url)`
// because bundlers (webpack, used by Next.js) statically rewrite that URL
// pattern into an asset import and fail when the target isn't a module.
const MIGRATIONS_FOLDER = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/**
 * Applies every migration under ./migrations. Drizzle tracks applied
 * migrations in its own `__drizzle_migrations` table, which is what makes
 * running this on an empty database and running it again on a database
 * that already has every migration both safe — the operator-facing
 * requirement from the infrastructure card.
 *
 * Called by both apps on startup, and directly via `pnpm db:migrate`.
 */
export async function runMigrations(): Promise<void> {
  const db = createDb(loadDbConfigFromEnv());
  try {
    await migrate(db.orm, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    await db.sql.end();
  }
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  runMigrations()
    .then(() => {
      console.log("Migrations applied.");
    })
    .catch((error: unknown) => {
      console.error("Migration failed:", error);
      process.exitCode = 1;
    });
}

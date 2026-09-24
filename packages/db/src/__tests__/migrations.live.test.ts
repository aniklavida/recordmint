import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import postgres, { type Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runMigrations } from "../migrate.js";

const adminUrl = process.env.DATABASE_URL;

function databaseUrl(databaseName: string): string {
  const url = new URL(adminUrl!);
  url.pathname = `/${databaseName}`;
  return url.toString();
}

async function createDatabase(admin: Sql, name: string): Promise<void> {
  await admin.unsafe(`CREATE DATABASE "${name}"`);
}

async function dropDatabase(admin: Sql, name: string): Promise<void> {
  await admin.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${name}' AND pid <> pg_backend_pid()`,
  );
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}"`);
}

describe.skipIf(!adminUrl)("migrations against a real PostgreSQL database", () => {
  const databases: string[] = [];
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "migrations");
  let admin: Sql;
  let previousMigrationsFolder: string;
  let currentMigrationCount: number;
  const originalDatabaseUrl = process.env.DATABASE_URL;

  beforeAll(async () => {
    admin = postgres(adminUrl!);
    previousMigrationsFolder = await mkdtemp(join(tmpdir(), "recordmint-previous-migrations-"));
    await mkdir(join(previousMigrationsFolder, "meta"));
    const migrationNames = (await readdir(migrationsFolder))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    await Promise.all(
      migrationNames.slice(0, -1).map((name) =>
        cp(join(migrationsFolder, name), join(previousMigrationsFolder, name)),
      ),
    );
    const journal = JSON.parse(
      await readFile(join(migrationsFolder, "meta", "_journal.json"), "utf8"),
    ) as { entries: unknown[] };
    currentMigrationCount = journal.entries.length;
    await writeFile(
      join(previousMigrationsFolder, "meta", "_journal.json"),
      JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }, null, 2),
    );
  });

  afterAll(async () => {
    for (const name of databases) await dropDatabase(admin, name);
    await admin.end();
    await rm(previousMigrationsFolder, { recursive: true, force: true });
    process.env.DATABASE_URL = originalDatabaseUrl;
  });

  it("applies cleanly to an empty database and upgrades the second-to-last migration state without data loss", async () => {
    const emptyDatabase = `recordmint_migrations_empty_${process.pid}_${Date.now()}`;
    const previousDatabase = `recordmint_migrations_previous_${process.pid}_${Date.now()}`;
    databases.push(emptyDatabase, previousDatabase);
    await createDatabase(admin, emptyDatabase);
    await createDatabase(admin, previousDatabase);

    process.env.DATABASE_URL = databaseUrl(emptyDatabase);
    await runMigrations();
    const emptyDb = postgres(process.env.DATABASE_URL);
    try {
      const currentObjects = await emptyDb`
        SELECT to_regclass('public.notification_settings') AS notification_settings,
          (SELECT count(*)::integer FROM drizzle.__drizzle_migrations) AS migration_count
      `;
      expect(currentObjects[0]).toEqual({
        notification_settings: "notification_settings",
        migration_count: currentMigrationCount,
      });
    } finally {
      await emptyDb.end();
    }

    process.env.DATABASE_URL = databaseUrl(previousDatabase);
    await runMigrations(previousMigrationsFolder);
    const previousDb = postgres(process.env.DATABASE_URL);
    try {
      await previousDb`
        INSERT INTO users (id, email, password_hash, name)
        VALUES ('migration-user', 'migration-user@example.test', 'hash', 'Migration User')
      `;
      await previousDb`
        INSERT INTO workspaces (id, name, slug, retention_days)
        VALUES ('migration-workspace', 'Migration Workspace', 'migration-workspace', 30)
      `;
      await runMigrations();
      const upgraded = await previousDb`
        SELECT u.email, u.name, w.name AS workspace_name, w.retention_days,
          to_regclass('public.notification_settings') AS notification_settings,
          (SELECT count(*)::integer FROM drizzle.__drizzle_migrations) AS migration_count
        FROM users u
        JOIN workspaces w ON w.id = 'migration-workspace'
        WHERE u.id = 'migration-user'
      `;
      expect(upgraded).toEqual([
        {
          email: "migration-user@example.test",
          name: "Migration User",
          workspace_name: "Migration Workspace",
          retention_days: 30,
          notification_settings: "notification_settings",
          migration_count: currentMigrationCount,
        },
      ]);
    } finally {
      await previousDb.end();
    }
  }, 60_000);
});

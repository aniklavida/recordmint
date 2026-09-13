import PgBoss from "pg-boss";
import { runMigrations } from "@recordmint/db";

/**
 * The worker process. Nothing here is on the critical path to a share
 * link (`docs/STRUCTURE.md`, `apps/worker`) — stopping this process must
 * never break recording, upload, sharing or playback.
 *
 * No jobs are registered yet: transcript, thumbnail and retention arrive
 * with the worker itself (`docs/ROADMAP.md` step 5). What ships today is
 * the piece that has to exist before any of them can: a queue connection
 * that starts cleanly and shuts down cleanly.
 */
async function main(): Promise<void> {
  const connectionString = requireEnv("DATABASE_URL");

  await runMigrations();

  const boss = new PgBoss(connectionString);
  boss.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  await boss.start();
  console.log("RecordMint worker ready. No jobs registered yet.");

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    console.log(`Received ${signal}, stopping worker.`);
    await boss.stop();
    process.exit(0);
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

main().catch((error: unknown) => {
  console.error("Worker failed to start:", error);
  process.exitCode = 1;
});

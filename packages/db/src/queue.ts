import PgBoss from "pg-boss";

export interface QueueConfig {
  connectionString: string;
}

/**
 * pg-boss on the same Postgres — no Redis (DECISIONS.md, 2026-09-13:
 * "Queue is pg-boss on the existing Postgres — no Redis. Postgres stays
 * the only stateful dependency"). pg-boss owns and migrates its own
 * schema (a `pgboss` schema with its own tables) the moment `start()` is
 * called; this package does not template or hand-write those tables,
 * only gives every process — `apps/web` enqueueing a transcript job,
 * `apps/worker` fetching one — the same construction point for the
 * connection, so the two never drift into different pg-boss configs.
 */
export function createQueue(config: QueueConfig): PgBoss {
  return new PgBoss(config.connectionString);
}

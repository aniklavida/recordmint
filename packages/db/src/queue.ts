import PgBoss from "pg-boss";

export interface QueueConfig {
  connectionString: string;
}

/**
 * pg-boss on the same Postgres — no Redis, so Postgres stays the only
 * stateful dependency a self-hoster has to run, back up and restore, and
 * a separate queue server never appears in the compose file for the sake
 * of two background jobs. pg-boss owns and migrates its own
 * schema (a `pgboss` schema with its own tables) the moment `start()` is
 * called; this package does not template or hand-write those tables,
 * only gives every process — `apps/web` enqueueing a transcript job,
 * `apps/worker` fetching one — the same construction point for the
 * connection, so the two never drift into different pg-boss configs.
 */
export function createQueue(config: QueueConfig): PgBoss {
  return new PgBoss(config.connectionString);
}

/**
 * The queue names both `apps/web` (enqueueing, once uploads exist) and
 * `apps/worker` (consuming) have to agree on. One shared list so the two
 * processes cannot drift into subscribing to a name nobody ever sends to,
 * or sending to a name nobody ever works.
 */
export const QUEUE_NAMES = {
  transcript: "recordmint-transcript",
  thumbnail: "recordmint-thumbnail",
  retentionSweep: "recordmint-retention-sweep",
  commentNotification: "recordmint-comment-notification",
  trim: "recordmint-trim",
} as const;

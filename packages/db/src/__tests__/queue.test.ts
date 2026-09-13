import type PgBoss from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createQueue } from "../queue.js";

/**
 * Confirms the card's pg-boss requirement against a real Postgres: the
 * queue starts (creating its own `pgboss` schema) and a job survives a
 * real enqueue/fetch/complete round trip. Skipped without DATABASE_URL
 * for the same reason as visibility.test.ts — CI has no live Postgres.
 */
describe.skipIf(!process.env.DATABASE_URL)("pg-boss queue", () => {
  let boss: PgBoss;
  const queueName = `recordmint-db-test-${Date.now()}`;

  beforeAll(async () => {
    boss = createQueue({ connectionString: process.env.DATABASE_URL! });
    await boss.start();
    await boss.createQueue(queueName);
  });

  afterAll(async () => {
    // Not deleteQueue(): pg-boss keeps a completed job's row in its
    // per-queue partition until its own archival maintenance runs, and
    // deleting the queue before that fires a foreign-key violation. The
    // queue name is unique per test run, so leaving it behind costs
    // nothing beyond a Postgres schema this test already owns.
    await boss.stop({ graceful: false });
  });

  it("enqueues and fetches a real job", async () => {
    const jobId = await boss.send(queueName, { hello: "recordmint" });
    expect(jobId).toBeTruthy();

    const [job] = await boss.fetch(queueName);
    expect(job).toBeTruthy();
    expect(job!.id).toBe(jobId);
    expect(job!.data).toEqual({ hello: "recordmint" });

    await boss.complete(queueName, job!.id);
  });
});

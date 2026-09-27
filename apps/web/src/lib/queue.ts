import type PgBoss from "pg-boss";
import { QUEUE_NAMES, createQueue, loadDbConfigFromEnv } from "@recordmint/db";

/**
 * The one queue connection this process needs so far: handing a
 * new-comment notification to the worker rather than sending mail
 * inline in the request (`../features/comments/application/notify.ts`).
 * Mirrors `lib/db.ts`'s one-pool-per-process pattern; `apps/worker`'s
 * `main.ts` is the one place that actually works this queue.
 *
 * The queue (and its dead-letter queue) is created here too, not only in
 * the worker: `boss.send()` fails against a queue that has never been
 * created, and a self-hosted deploy has no guarantee the worker process
 * has started before the web app's first comment does. `createQueue` is
 * safe to call from both processes — pg-boss treats it as an idempotent
 * "ensure this exists," not a one-time setup step — and the retry/backoff/
 * dead-letter configuration passed here must match what `apps/worker`
 * registers, since whichever process gets there first is the one pg-boss
 * actually applies it from.
 */
let boss: PgBoss | undefined;
let starting: Promise<PgBoss> | undefined;

async function startQueue(): Promise<PgBoss> {
  const instance = createQueue(loadDbConfigFromEnv());
  instance.on("error", (error) => {
    console.error("pg-boss error:", error);
  });
  await instance.start();
  await instance.createQueue(`${QUEUE_NAMES.commentNotification}-dead-letter`);
  await instance.createQueue(QUEUE_NAMES.commentNotification, {
    name: QUEUE_NAMES.commentNotification,
    retryLimit: 3,
    retryBackoff: true,
    deadLetter: `${QUEUE_NAMES.commentNotification}-dead-letter`,
  });
  await instance.createQueue(`${QUEUE_NAMES.trim}-dead-letter`);
  await instance.createQueue(QUEUE_NAMES.trim, {
    name: QUEUE_NAMES.trim,
    retryLimit: 3,
    retryBackoff: true,
    deadLetter: `${QUEUE_NAMES.trim}-dead-letter`,
  });
  if (process.env.TRANSCRIPTION_ENABLED === "true") {
    await instance.createQueue(`${QUEUE_NAMES.transcript}-dead-letter`);
    await instance.createQueue(QUEUE_NAMES.transcript, {
      name: QUEUE_NAMES.transcript,
      retryLimit: 3,
      retryBackoff: true,
      deadLetter: `${QUEUE_NAMES.transcript}-dead-letter`,
    });
  }
  return instance;
}

export async function getQueue(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= startQueue();
  boss = await starting;
  return boss;
}

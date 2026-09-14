import PgBoss from "pg-boss";
import { QUEUE_NAMES, runMigrations } from "@recordmint/db";
import { runRetentionSweep } from "./jobs/retention.js";
import { runThumbnailJob, type ThumbnailJobData } from "./jobs/thumbnail.js";
import { runTranscriptJob, type TranscriptJobData } from "./jobs/transcript.js";

/**
 * The worker process. Nothing here is on the critical path to a share
 * link (`docs/STRUCTURE.md`, `apps/worker`) — stopping this process must
 * never break recording, upload, sharing or playback. Every job handler
 * below reflects that: `thumbnail` and `transcript` each check whether
 * their own output already exists before doing anything, so redelivery
 * after a crash finishes the job rather than duplicating or losing it.
 */
async function main(): Promise<void> {
  const connectionString = requireEnv("DATABASE_URL");
  const transcriptionEnabled = process.env.TRANSCRIPTION_ENABLED === "true";

  await runMigrations();

  const boss = new PgBoss(connectionString);
  boss.on("error", (error) => {
    console.error("pg-boss error:", error);
  });

  await boss.start();

  // A dead-letter queue per job type: a job that exhausts its retries
  // lands here instead of vanishing, which is what "a dead-letter path"
  // means concretely rather than as a sentence in a specification.
  await boss.createQueue(`${QUEUE_NAMES.thumbnail}-dead-letter`);
  await boss.createQueue(QUEUE_NAMES.thumbnail, {
    name: QUEUE_NAMES.thumbnail,
    retryLimit: 3,
    retryBackoff: true,
    deadLetter: `${QUEUE_NAMES.thumbnail}-dead-letter`,
  });
  await boss.work<ThumbnailJobData>(QUEUE_NAMES.thumbnail, async (jobs) => {
    for (const job of jobs) {
      await runThumbnailJob(job.data);
    }
  });

  if (transcriptionEnabled) {
    await boss.createQueue(`${QUEUE_NAMES.transcript}-dead-letter`);
    await boss.createQueue(QUEUE_NAMES.transcript, {
      name: QUEUE_NAMES.transcript,
      retryLimit: 3,
      retryBackoff: true,
      deadLetter: `${QUEUE_NAMES.transcript}-dead-letter`,
    });
    await boss.work<TranscriptJobData>(QUEUE_NAMES.transcript, async (jobs) => {
      for (const job of jobs) {
        await runTranscriptJob(job.data);
      }
    });
  } else {
    console.log("TRANSCRIPTION_ENABLED is not \"true\" — the transcript queue is not started. Every other capability still works.");
  }

  // Retention (SPEC.md §14) runs on its own schedule rather than being
  // enqueued per recording — it is a sweep over every workspace, not a
  // per-recording job. pg-boss's own `schedule` needs the queue to exist
  // first, same as any other.
  await boss.createQueue(QUEUE_NAMES.retentionSweep);
  await boss.work(QUEUE_NAMES.retentionSweep, async () => {
    const result = await runRetentionSweep();
    console.log(
      `Retention sweep: ${result.expiredCount} recording(s) past retention, ${result.abandonedCount} abandoned upload(s) cleaned up.`,
    );
  });
  await boss.schedule(QUEUE_NAMES.retentionSweep, "0 * * * *"); // hourly

  console.log(
    `RecordMint worker ready. Queues: ${QUEUE_NAMES.thumbnail}, ${QUEUE_NAMES.retentionSweep}` +
      (transcriptionEnabled ? `, ${QUEUE_NAMES.transcript}` : " (transcription disabled)"),
  );

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

import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getRecordingById, setRecordingPosterKey } from "@recordmint/db";
import { getObjectStream, posterKey, putObject } from "@recordmint/storage";
import { getDb } from "../lib/db.js";
import { getStorageClient, getStorageConfig } from "../lib/storage.js";
import { extractPosterFrame } from "../media/ffmpeg.js";

export interface ThumbnailJobData {
  recordingId: string;
}

/**
 * Nothing here is on the critical path to a share link — a recording is
 * fully playable and shareable with no poster at all, the player page
 * just falls back to the browser's own first-frame behaviour. Idempotent
 * by construction: a recording that already has a `posterKey` is skipped,
 * so re-delivering this job (pg-boss retry, a duplicate enqueue) never
 * does the work twice.
 */
export async function runThumbnailJob(data: ThumbnailJobData): Promise<void> {
  const db = getDb();
  const recording = await getRecordingById(db.orm, data.recordingId);
  if (!recording) return; // deleted before the job ran
  if (recording.posterKey) return; // already has one

  const workDir = await mkdtemp(join(tmpdir(), "recordmint-thumbnail-"));
  try {
    const sourcePath = join(workDir, `source.${recording.container ?? "mp4"}`);
    const client = getStorageClient();
    const config = getStorageConfig();

    const objectStream = await getObjectStream(client, config.bucket, recording.objectKey);
    await pipeline(objectStream, createWriteStream(sourcePath));

    const posterPath = join(workDir, "poster.jpg");
    await extractPosterFrame(sourcePath, posterPath);

    const posterBytes = await readFile(posterPath);
    const key = posterKey(recording.id);
    await putObject(client, config.bucket, key, posterBytes, "image/jpeg");

    await setRecordingPosterKey(db.orm, recording.id, key);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

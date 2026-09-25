import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getRecordingById, setTrimFailed, setTrimProcessing, setTrimReady } from "@recordmint/db";
import { getObjectStream, putObject, trimmedKey } from "@recordmint/storage";
import { getDb } from "../lib/db";
import { getStorageClient, getStorageConfig } from "../lib/storage";
import { trimMediaFile, verifyTrimmedMedia } from "../media/ffmpeg";

export interface TrimJobData {
  recordingId: string;
  startSeconds: number;
  endSeconds: number;
}

export async function runTrimJob(data: TrimJobData): Promise<void> {
  const db = getDb();
  const recording = await getRecordingById(db.orm, data.recordingId);
  if (!recording || recording.trimStatus === "ready") return;
  if (
    recording.trimStatus !== "pending" &&
    recording.trimStatus !== "processing" &&
    recording.trimStatus !== "failed"
  ) {
    return;
  }
  if (
    recording.trimStartSeconds !== data.startSeconds ||
    recording.trimEndSeconds !== data.endSeconds
  ) {
    return;
  }

  await setTrimProcessing(db.orm, recording.id);
  const workDir = await mkdtemp(join(tmpdir(), "recordmint-trim-"));
  try {
    const ext = recording.container ?? "mp4";
    const sourcePath = join(workDir, `source.${ext}`);
    const outputPath = join(workDir, `trimmed.${ext}`);
    const client = getStorageClient();
    const config = getStorageConfig();

    const originalStream = await getObjectStream(client, config.bucket, recording.objectKey);
    await pipeline(originalStream, createWriteStream(sourcePath));

    const expectedDuration = data.endSeconds - data.startSeconds;
    await trimMediaFile(sourcePath, outputPath, data.startSeconds, data.endSeconds);
    const actualDuration = await verifyTrimmedMedia(outputPath, expectedDuration);
    const outputBytes = await readFile(outputPath);
    const key = trimmedKey(recording.id, ext);
    await putObject(client, config.bucket, key, outputBytes, ext === "webm" ? "video/webm" : "video/mp4");
    await setTrimReady(db.orm, { recordingId: recording.id, objectKey: key, durationSeconds: actualDuration });
  } catch (error) {
    await setTrimFailed(db.orm, {
      recordingId: recording.id,
      reason: error instanceof Error ? error.message : "The trim job failed.",
    });
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

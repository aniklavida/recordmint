import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getRecordingById, upsertTranscript } from "@recordmint/db";
import { getObjectStream, transcriptKey, putObject } from "@recordmint/storage";
import { cuesToPlainText, generateId, parseVtt } from "@recordmint/shared";
import { getDb } from "../lib/db.js";
import { getStorageClient, getStorageConfig } from "../lib/storage.js";
import { TranscriptionUnavailableError, transcribeToVtt } from "../media/whisper.js";

export interface TranscriptJobData {
  recordingId: string;
}

/**
 * One job output feeding three surfaces (SPEC.md §14): the WebVTT file
 * this writes becomes player captions directly, `transcripts.text`
 * becomes the library's cross-recording search, and the same VTT file is
 * what the player's transcript-search panel parses client-side for
 * in-recording search. Failure here is deliberately non-fatal to the
 * recording — a missing transcription binary marks the transcript
 * `failed` and returns normally, it does not throw the job into pg-boss's
 * retry loop forever, because retrying will never make an uninstalled
 * binary appear.
 */
export async function runTranscriptJob(data: TranscriptJobData): Promise<void> {
  const db = getDb();
  const recording = await getRecordingById(db.orm, data.recordingId);
  if (!recording) return; // deleted before the job ran

  const modelSize = process.env.WHISPER_MODEL ?? "base";
  await upsertTranscript(db.orm, { id: generateId(), recordingId: recording.id, status: "pending" });

  const workDir = await mkdtemp(join(tmpdir(), "recordmint-transcript-"));
  try {
    const sourcePath = join(workDir, `source.${recording.container ?? "mp4"}`);
    const client = getStorageClient();
    const config = getStorageConfig();
    const objectStream = await getObjectStream(client, config.bucket, recording.objectKey);
    await pipeline(objectStream, createWriteStream(sourcePath));

    const vttPath = join(workDir, "transcript.vtt");
    try {
      await transcribeToVtt(sourcePath, vttPath, modelSize);
    } catch (error) {
      if (error instanceof TranscriptionUnavailableError) {
        await upsertTranscript(db.orm, {
          id: generateId(),
          recordingId: recording.id,
          status: "failed",
          errorMessage: error.message,
        });
        return; // non-fatal: a recording with no transcript is a normal recording
      }
      throw error; // a genuine transcription crash — let pg-boss's retry/backoff handle it
    }

    const vttContent = await readFile(vttPath, "utf8");
    const cues = parseVtt(vttContent);
    const key = transcriptKey(recording.id);
    await putObject(client, config.bucket, key, Buffer.from(vttContent, "utf8"), "text/vtt");

    await upsertTranscript(db.orm, {
      id: generateId(),
      recordingId: recording.id,
      status: "ready",
      objectKey: key,
      text: cuesToPlainText(cues),
    });
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

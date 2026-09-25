import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getRecordingById, getTranscriptForRecording, upsertTranscript } from "@recordmint/db";
import { getObjectStream, transcriptKey, putObject } from "@recordmint/storage";
import { cuesToPlainText, generateId, parseVtt } from "@recordmint/shared";
import { getDb } from "../lib/db.js";
import { getStorageClient, getStorageConfig } from "../lib/storage.js";
import { extractAudio, FfmpegError } from "../media/ffmpeg.js";
import {
  assertWhisperBinaryAvailable,
  TranscriptionError,
  TranscriptionUnavailableError,
  transcribeToVtt,
} from "../media/whisper.js";

export interface TranscriptJobData {
  recordingId: string;
}

/**
 * One job output feeding three surfaces (SPEC.md §14): the WebVTT file
 * this writes becomes player captions directly, `transcripts.text`
 * becomes the library's cross-recording search, and the same VTT file is
 * what the player's transcript-search panel parses client-side for
 * in-recording search. Failure here is deliberately non-fatal to the
 * recording — an unavailable binary or rejected media file marks the
 * transcript `failed` and returns normally.
 */
export async function runTranscriptJob(data: TranscriptJobData): Promise<void> {
  const db = getDb();
  const recording = await getRecordingById(db.orm, data.recordingId);
  if (!recording) return; // deleted before the job ran

  const existingTranscript = await getTranscriptForRecording(db.orm, recording.id);
  if (existingTranscript?.status === "ready") return;

  const modelPath = process.env.WHISPER_MODEL;
  await upsertTranscript(db.orm, { id: generateId(), recordingId: recording.id, status: "pending" });

  const workDir = await mkdtemp(join(tmpdir(), "recordmint-transcript-"));
  try {
    assertWhisperBinaryAvailable();
    if (!modelPath) {
      await upsertTranscript(db.orm, {
        id: generateId(),
        recordingId: recording.id,
        status: "failed",
        errorMessage: "WHISPER_MODEL must point to a model file when transcription is enabled.",
      });
      return;
    }

    const sourcePath = join(workDir, `source.${recording.container ?? "mp4"}`);
    const client = getStorageClient();
    const config = getStorageConfig();
    const objectStream = await getObjectStream(client, config.bucket, recording.objectKey);
    await pipeline(objectStream, createWriteStream(sourcePath));

    const audioPath = join(workDir, "audio.wav");
    await extractAudio(sourcePath, audioPath);

    const vttPath = join(workDir, "transcript.vtt");
    await transcribeToVtt(audioPath, vttPath, modelPath);

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
  } catch (error) {
    if (error instanceof FfmpegError || error instanceof TranscriptionError || error instanceof TranscriptionUnavailableError) {
      await upsertTranscript(db.orm, {
        id: generateId(),
        recordingId: recording.id,
        status: "failed",
        errorMessage: error.message,
      });
      return;
    }
    throw error;
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

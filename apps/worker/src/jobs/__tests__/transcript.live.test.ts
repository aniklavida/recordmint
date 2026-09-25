import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createDb, getTranscriptForRecording, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { deleteRecordingObjects, getObjectStream, originalKey, putObject, transcriptKey } from "@recordmint/storage";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../lib/db.js";
import { getStorageClient, getStorageConfig } from "../../lib/storage.js";
import { isWhisperBinaryAvailable } from "../../media/whisper.js";
import { runTranscriptJob } from "../transcript.js";

const ffmpegPath = process.env.FFMPEG_BINARY_PATH ?? "ffmpeg";
const ffmpegAvailable = spawnSync(ffmpegPath, ["-version"]).status === 0;
const storageConfigured = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "DATABASE_URL",
  "WHISPER_MODEL",
  "WHISPER_TEST_AUDIO_PATH",
].every((name) => Boolean(process.env[name]));

async function readObject(key: string): Promise<string> {
  const client = getStorageClient();
  const stream = await getObjectStream(client, getStorageConfig().bucket, key);
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks).toString("utf8");
}

describe.skipIf(!storageConfigured || !ffmpegAvailable || !isWhisperBinaryAvailable())(
  "runTranscriptJob against real transcription and live storage",
  () => {
    let db: ReturnType<typeof createDb>;
    let workDir: string;
    const workspaceId = generateId();
    const userId = generateId();
    const recordingIds = new Set<string>();

    async function createRecording(title: string, body: Buffer): Promise<string> {
      const recordingId = generateId();
      const objectKey = originalKey(recordingId, "mp4");
      recordingIds.add(recordingId);

      const client = getStorageClient();
      await putObject(client, getStorageConfig().bucket, objectKey, body, "video/mp4");
      await db.orm.insert(schema.recordings).values({
        id: recordingId,
        publicId: generatePublicId(),
        workspaceId,
        creatorId: userId,
        title,
        objectKey,
        container: "mp4",
        status: "ready",
      });

      return recordingId;
    }

    beforeAll(async () => {
      db = getDb();
      await runMigrations();
      await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "Transcript live", slug: `w-${workspaceId}` });
      await db.orm.insert(schema.users).values({
        id: userId,
        email: `u-${userId}@example.test`,
        passwordHash: "x",
        name: "U",
      });

      workDir = await mkdtemp(join(tmpdir(), "recordmint-transcript-live-"));
      const sourceVideoPath = join(workDir, "source.mp4");
      const result = spawnSync(ffmpegPath, [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=11:size=160x120:rate=5",
        "-i",
        process.env.WHISPER_TEST_AUDIO_PATH!,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:a",
        "aac",
        "-shortest",
        "-pix_fmt",
        "yuv420p",
        sourceVideoPath,
      ]);
      if (result.status !== 0) throw new Error("Failed to generate speech fixture recording");
    });

    afterAll(async () => {
      const client = getStorageClient();
      const config = getStorageConfig();
      for (const recordingId of recordingIds) {
        await deleteRecordingObjects(client, config.bucket, recordingId);
      }
      await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
      await rm(workDir, { recursive: true, force: true });
      await db.sql.end();
    });

    it("writes real WebVTT to live storage and marks the transcript ready", async () => {
      const recordingId = await createRecording(
        "Real speech",
        await readFile(join(workDir, "source.mp4")),
      );

      await runTranscriptJob({ recordingId });

      const transcript = await getTranscriptForRecording(db.orm, recordingId);
      expect(transcript?.status).toBe("ready");
      expect(transcript?.objectKey).toBe(transcriptKey(recordingId));
      expect(transcript?.text).toMatch(/fellow Americans/i);

      const client = getStorageClient();
      const config = getStorageConfig();
      await client.send(new DeleteObjectCommand({ Bucket: config.bucket, Key: originalKey(recordingId, "mp4") }));
      await expect(runTranscriptJob({ recordingId })).resolves.toBeUndefined();

      const vtt = await readObject(transcriptKey(recordingId));
      expect(vtt).toMatch(/^WEBVTT/);
      expect(vtt).toMatch(/-->/);
      expect(vtt).toMatch(/fellow Americans/i);
    }, 120_000);

    it("marks corrupt input failed without throwing", async () => {
      const sourcePath = join(workDir, "corrupt.mp4");
      await writeFile(sourcePath, Buffer.from("not a real recording"));
      const recordingId = await createRecording("Corrupt input", await readFile(sourcePath));

      await expect(runTranscriptJob({ recordingId })).resolves.toBeUndefined();

      const transcript = await getTranscriptForRecording(db.orm, recordingId);
      expect(transcript?.status).toBe("failed");
      expect(transcript?.errorMessage).toMatch(/exited with code/);
      expect(transcript?.objectKey ?? null).toBeNull();
      await expect(readObject(transcriptKey(recordingId))).rejects.toThrow();
    }, 120_000);
  },
);

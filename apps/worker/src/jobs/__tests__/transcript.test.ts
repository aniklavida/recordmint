import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createDb, getTranscriptForRecording, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isWhisperBinaryAvailable } from "../../media/whisper.js";

/**
 * This machine has no whisper.cpp/faster-whisper installed, which is the
 * real, documented state SPEC.md §14 explicitly allows for ("must be
 * switchable off entirely"). This test proves what actually happens on
 * that machine: the job runs to completion, marks the transcript
 * `failed` with a clear reason, and — critically — does not throw, so
 * pg-boss never retries a job that can only ever fail the same way. On a
 * machine with a working transcription binary, this is skipped in favour
 * of testing the real success path there instead.
 */
describe.skipIf(!process.env.DATABASE_URL || isWhisperBinaryAvailable())(
  "runTranscriptJob without a transcription binary installed",
  () => {
    let db: ReturnType<typeof createDb>;
    let workDir: string;
    let sourceVideoPath: string;
    const workspaceId = generateId();
    const userId = generateId();
    const recordingId = generateId();

    beforeAll(async () => {
      db = createDb({ connectionString: process.env.DATABASE_URL! });
      await runMigrations();
      workDir = await mkdtemp(join(tmpdir(), "recordmint-transcript-job-test-"));
      sourceVideoPath = join(workDir, "source.mp4");
      await writeFile(sourceVideoPath, Buffer.from("not a real video, never reaches ffmpeg/whisper in this test"));

      await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "W", slug: `w-${workspaceId}` });
      await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });
      await db.orm.insert(schema.recordings).values({
        id: recordingId,
        publicId: generatePublicId(),
        workspaceId,
        creatorId: userId,
        title: "Needs a transcript",
        objectKey: `recordings/${recordingId}/original.mp4`,
        container: "mp4",
      });
    });

    afterAll(async () => {
      await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
      await rm(workDir, { recursive: true, force: true });
      await db.sql.end();
    });

    it("marks the transcript failed with a clear reason and completes without throwing", async () => {
      vi.resetModules();
      const putSpy = vi.fn();
      const fakeClient = {
        send: vi.fn(async (command: unknown) => {
          if (command instanceof GetObjectCommand) {
            return { Body: createReadStream(sourceVideoPath) };
          }
          if (command instanceof PutObjectCommand) {
            putSpy(command.input);
            return {};
          }
          throw new Error("unexpected command");
        }),
      };
      vi.doMock("../../lib/storage.js", () => ({
        getStorageClient: () => fakeClient,
        getStorageConfig: () => ({ bucket: "fake-bucket" }),
      }));
      vi.doMock("../../lib/db.js", () => ({ getDb: () => db }));

      const { runTranscriptJob } = await import("../transcript.js");
      await expect(runTranscriptJob({ recordingId })).resolves.toBeUndefined();

      // Non-fatal means no upload of a transcript ever happens on this path.
      expect(putSpy).not.toHaveBeenCalled();

      const transcript = await getTranscriptForRecording(db.orm, recordingId);
      expect(transcript?.status).toBe("failed");
      expect(transcript?.errorMessage).toMatch(/WHISPER_BINARY_PATH/);
      expect(transcript?.objectKey ?? null).toBeNull();

      vi.doUnmock("../../lib/storage.js");
      vi.doUnmock("../../lib/db.js");
    }, 30_000);
  },
);

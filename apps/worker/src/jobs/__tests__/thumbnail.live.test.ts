import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDb, getRecordingById, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { getObjectStream, originalKey, posterKey, putObject } from "@recordmint/storage";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStorageClient, getStorageConfig } from "../../lib/storage.js";
import { runThumbnailJob } from "../thumbnail.js";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

/**
 * `thumbnail.test.ts` proves the job's orchestration with the S3 client
 * faked — this is the missing other half: the same job, unmocked, against
 * a real S3-compatible endpoint, so "uploads a real thumbnail object" is
 * something a `GetObject` call actually confirms rather than something a
 * spy recorded. A real ffmpeg subprocess reads a real source video from
 * real storage and writes a real JPEG back to it.
 */
describe.skipIf(!process.env.S3_ENDPOINT || !process.env.DATABASE_URL || !ffmpegAvailable)(
  "runThumbnailJob against live storage",
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

      workDir = await mkdtemp(join(tmpdir(), "recordmint-thumbnail-live-"));
      sourceVideoPath = join(workDir, "source.mp4");
      const result = spawnSync("ffmpeg", [
        "-y",
        "-f",
        "lavfi",
        "-i",
        "testsrc=duration=3:size=160x120:rate=5",
        "-pix_fmt",
        "yuv420p",
        sourceVideoPath,
      ]);
      if (result.status !== 0) throw new Error("Failed to generate fixture video");

      const objectKey = originalKey(recordingId, "mp4");
      const client = getStorageClient();
      const config = getStorageConfig();
      const { readFile } = await import("node:fs/promises");
      await putObject(client, config.bucket, objectKey, await readFile(sourceVideoPath), "video/mp4");

      await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "W", slug: `w-${workspaceId}` });
      await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });
      await db.orm.insert(schema.recordings).values({
        id: recordingId,
        publicId: generatePublicId(),
        workspaceId,
        creatorId: userId,
        title: "Needs a real thumbnail",
        objectKey,
        container: "mp4",
      });
    });

    afterAll(async () => {
      await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, workspaceId));
      await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
      await rm(workDir, { recursive: true, force: true });
      await db.sql.end();
    });

    it("downloads the real object, extracts a real JPEG poster frame with ffmpeg, and uploads it for real", async () => {
      await runThumbnailJob({ recordingId });

      const updated = await getRecordingById(db.orm, recordingId);
      expect(updated?.posterKey).toBe(posterKey(recordingId));

      const client = getStorageClient();
      const config = getStorageConfig();
      const stream = await getObjectStream(client, config.bucket, posterKey(recordingId));
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
      const posterBytes = Buffer.concat(chunks);

      expect(posterBytes.length).toBeGreaterThan(0);
      // Real JPEG magic bytes (SOI marker) — proves ffmpeg actually produced
      // a JPEG, not that some arbitrary bytes made it into the bucket.
      expect(posterBytes[0]).toBe(0xff);
      expect(posterBytes[1]).toBe(0xd8);
    }, 30_000);
  },
);

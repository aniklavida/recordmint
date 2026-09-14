import { spawnSync } from "node:child_process";
import { createReadStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createDb, getRecordingById, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { posterKey } from "@recordmint/storage";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;

/**
 * Exercises the real job orchestration — a live Postgres row, a real
 * ffmpeg subprocess extracting a real frame from a real video file — with
 * only the S3 client faked, since this sandbox has no live storage
 * endpoint to test against (matching every other storage-dependent test
 * in this repository, which skips without a live endpoint rather than
 * standing up a mock server). The fake still goes through the real
 * `@recordmint/storage` `getObjectStream`/`putObject` functions, so this
 * proves the job's own logic — not a reimplementation of it.
 */
describe.skipIf(!process.env.DATABASE_URL || !ffmpegAvailable)("runThumbnailJob", () => {
  let db: ReturnType<typeof createDb>;
  let workDir: string;
  let sourceVideoPath: string;
  const workspaceId = generateId();
  const userId = generateId();
  const recordingId = generateId();
  let putCalls: { key: string; bodyLength: number; contentType?: string }[] = [];

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();

    workDir = await mkdtemp(join(tmpdir(), "recordmint-thumbnail-job-test-"));
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

    await db.orm.insert(schema.workspaces).values({ id: workspaceId, name: "W", slug: `w-${workspaceId}` });
    await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });
    await db.orm.insert(schema.recordings).values({
      id: recordingId,
      publicId: generatePublicId(),
      workspaceId,
      creatorId: userId,
      title: "Needs a thumbnail",
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

  it("downloads the object, extracts a real poster frame, uploads it, and records the key", async () => {
    vi.resetModules();
    putCalls = [];

    const fakeClient = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof GetObjectCommand) {
          expect(command.input.Key).toBe(`recordings/${recordingId}/original.mp4`);
          return { Body: createReadStream(sourceVideoPath) };
        }
        if (command instanceof PutObjectCommand) {
          const body = command.input.Body as Buffer;
          putCalls.push({ key: command.input.Key!, bodyLength: body.length, contentType: command.input.ContentType });
          return {};
        }
        throw new Error(`Unexpected command: ${command?.constructor.name}`);
      }),
    };

    vi.doMock("../../lib/storage.js", () => ({
      getStorageClient: () => fakeClient,
      getStorageConfig: () => ({
        endpoint: "http://fake",
        region: "us-east-1",
        bucket: "fake-bucket",
        accessKeyId: "x",
        secretAccessKey: "x",
        forcePathStyle: true,
      }),
    }));
    vi.doMock("../../lib/db.js", () => ({ getDb: () => db }));

    const { runThumbnailJob } = await import("../thumbnail.js");
    await runThumbnailJob({ recordingId });

    expect(putCalls).toHaveLength(1);
    expect(putCalls[0]!.key).toBe(posterKey(recordingId));
    expect(putCalls[0]!.contentType).toBe("image/jpeg");
    expect(putCalls[0]!.bodyLength).toBeGreaterThan(0);
    // Real JPEG magic bytes were verified in media/__tests__/ffmpeg.test.ts —
    // this test's job is proving the orchestration wires that output through
    // to the exact expected storage key and the database row.

    const updated = await getRecordingById(db.orm, recordingId);
    expect(updated?.posterKey).toBe(posterKey(recordingId));

    vi.doUnmock("../../lib/storage.js");
    vi.doUnmock("../../lib/db.js");
  }, 30_000);

  it("is a no-op when the recording already has a poster key", async () => {
    vi.resetModules();
    const fakeClient = { send: vi.fn() };
    vi.doMock("../../lib/storage.js", () => ({
      getStorageClient: () => fakeClient,
      getStorageConfig: () => ({ bucket: "fake-bucket" }),
    }));
    vi.doMock("../../lib/db.js", () => ({ getDb: () => db }));

    const { runThumbnailJob } = await import("../thumbnail.js");
    await runThumbnailJob({ recordingId }); // already has a posterKey from the previous test

    expect(fakeClient.send).not.toHaveBeenCalled();

    vi.doUnmock("../../lib/storage.js");
    vi.doUnmock("../../lib/db.js");
  });
});

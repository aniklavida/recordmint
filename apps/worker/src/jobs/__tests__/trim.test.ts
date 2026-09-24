import { createReadStream } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { createDb, getRecordingById, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { trimmedKey } from "@recordmint/storage";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawnSync } from "node:child_process";

const ffmpegAvailable = spawnSync("ffmpeg", ["-version"]).status === 0;
const ffprobeAvailable = spawnSync("ffprobe", ["-version"]).status === 0;

describe.skipIf(!process.env.DATABASE_URL || !ffmpegAvailable || !ffprobeAvailable)("runTrimJob", () => {
  let db: ReturnType<typeof createDb>;
  let workDir: string;
  let sourcePath: string;
  let invalidSourcePath: string;
  let runTrimJob: typeof import("../trim.js").runTrimJob;
  const workspaceId = generateId();
  const userId = generateId();
  const validRecordingId = generateId();
  const invalidRecordingId = generateId();
  const validOriginalKey = `recordings/${validRecordingId}/original.mp4`;
  const invalidOriginalKey = `recordings/${invalidRecordingId}/original.mp4`;
  let putKeys: string[] = [];

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();
    workDir = await mkdtemp(join(tmpdir(), "recordmint-trim-job-test-"));
    sourcePath = join(workDir, "source.mp4");
    invalidSourcePath = join(workDir, "invalid.mp4");
    const result = spawnSync("ffmpeg", [
      "-y",
      "-f",
      "lavfi",
      "-i",
      "testsrc2=duration=6:size=160x120:rate=10",
      "-pix_fmt",
      "yuv420p",
      sourcePath,
    ]);
    if (result.status !== 0) throw new Error("Failed to generate trim fixture");
    await writeFile(invalidSourcePath, "not a media file");
    await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'W', ${`w-${workspaceId}`})`;
    await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${userId}, ${`${userId}@example.test`}, 'x', 'U')`;
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key, container, duration_seconds, trim_status, trim_start_seconds, trim_end_seconds)
      VALUES (${validRecordingId}, ${generatePublicId()}, ${workspaceId}, ${userId}, 'Valid', 'ready', ${validOriginalKey}, 'mp4', 6, 'pending', 1.5, 4.25)
    `;
    await db.sql`
      INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key, container, duration_seconds, trim_status, trim_start_seconds, trim_end_seconds)
      VALUES (${invalidRecordingId}, ${generatePublicId()}, ${workspaceId}, ${userId}, 'Invalid', 'ready', ${invalidOriginalKey}, 'mp4', 6, 'pending', 1, 3)
    `;

    const fakeClient = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof GetObjectCommand) {
          const path = command.input.Key === validOriginalKey ? sourcePath : invalidSourcePath;
          return { Body: createReadStream(path) };
        }
        if (command instanceof PutObjectCommand) {
          putKeys.push(command.input.Key!);
          return {};
        }
        throw new Error(`Unexpected command: ${(command as { constructor: { name: string } }).constructor.name}`);
      }),
    };
    vi.doMock("../../lib/storage.js", () => ({
      getStorageClient: () => fakeClient,
      getStorageConfig: () => ({ bucket: "fake-bucket" }),
    }));
    vi.doMock("../../lib/db.js", () => ({ getDb: () => db }));
    runTrimJob = (await import("../trim.js")).runTrimJob;
  });

  afterAll(async () => {
    await db.sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
    await db.sql`DELETE FROM users WHERE id = ${userId}`;
    await rm(workDir, { recursive: true, force: true });
    await db.sql.end();
    vi.doUnmock("../../lib/storage.js");
    vi.doUnmock("../../lib/db.js");
  });

  it("uploads a verified derived object without changing the original key", async () => {
    await runTrimJob({ recordingId: validRecordingId, startSeconds: 1.5, endSeconds: 4.25 });
    const recording = await getRecordingById(db.orm, validRecordingId);
    expect(recording?.objectKey).toBe(validOriginalKey);
    expect(recording?.trimStatus).toBe("ready");
    expect(recording?.trimmedObjectKey).toBe(trimmedKey(validRecordingId, "mp4"));
    expect(recording?.trimmedDurationSeconds).toBeGreaterThan(1.5);
    expect(putKeys).toEqual([trimmedKey(validRecordingId, "mp4")]);
  }, 30_000);

  it("leaves the original untouched and uploads nothing when verification fails", async () => {
    putKeys = [];
    await expect(runTrimJob({ recordingId: invalidRecordingId, startSeconds: 1, endSeconds: 3 })).rejects.toThrow();
    const recording = await getRecordingById(db.orm, invalidRecordingId);
    expect(recording?.objectKey).toBe(invalidOriginalKey);
    expect(recording?.trimStatus).toBe("failed");
    expect(putKeys).toHaveLength(0);
  }, 30_000);
});

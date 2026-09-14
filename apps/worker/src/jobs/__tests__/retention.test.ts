import { AbortMultipartUploadCommand, DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import { createDb, getRecordingById, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Storage is faked (no live S3 endpoint in this sandbox, same reason
 * every other storage-touching test here is faked or skipped) but the
 * selection logic — which recordings are past retention, which uploads
 * are abandoned — runs against a real Postgres, the same live database
 * already proven correct by packages/db's own retention query tests.
 * This test's job is proving the *sweep* calls the right storage
 * operations for the right rows and then actually removes them.
 */
describe.skipIf(!process.env.DATABASE_URL)("runRetentionSweep", () => {
  let db: ReturnType<typeof createDb>;
  const retainedWorkspaceId = generateId();
  const foreverWorkspaceId = generateId();
  const userId = generateId();
  const overdueRecordingId = generateId();
  const keptRecordingId = generateId();
  const abandonedRecordingId = generateId();

  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

  beforeAll(async () => {
    db = createDb({ connectionString: process.env.DATABASE_URL! });
    await runMigrations();

    await db.orm.insert(schema.workspaces).values([
      { id: retainedWorkspaceId, name: "Retained", slug: `retained-${retainedWorkspaceId}`, retentionDays: 1 },
      { id: foreverWorkspaceId, name: "Forever", slug: `forever-${foreverWorkspaceId}` },
    ]);
    await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });

    await db.orm.insert(schema.recordings).values([
      {
        id: overdueRecordingId,
        publicId: generatePublicId(),
        workspaceId: retainedWorkspaceId,
        creatorId: userId,
        title: "Overdue",
        objectKey: `recordings/${overdueRecordingId}/original.mp4`,
        status: "ready",
        createdAt: twoDaysAgo,
      },
      {
        id: keptRecordingId,
        publicId: generatePublicId(),
        workspaceId: foreverWorkspaceId,
        creatorId: userId,
        title: "Kept forever",
        objectKey: `recordings/${keptRecordingId}/original.mp4`,
        status: "ready",
        createdAt: twoDaysAgo,
      },
      {
        id: abandonedRecordingId,
        publicId: generatePublicId(),
        workspaceId: retainedWorkspaceId,
        creatorId: userId,
        title: "Abandoned upload",
        objectKey: `recordings/${abandonedRecordingId}/original.mp4`,
        status: "uploading",
        uploadId: "abandoned-upload-id",
        createdAt: twoDaysAgo,
      },
    ]);
  });

  afterAll(async () => {
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, retainedWorkspaceId));
    await db.orm.delete(schema.workspaces).where(eq(schema.workspaces.id, foreverWorkspaceId));
    await db.orm.delete(schema.users).where(eq(schema.users.id, userId));
    await db.sql.end();
  });

  it("deletes the overdue and abandoned recordings, aborts the abandoned multipart upload, and leaves the retained-forever one alone", async () => {
    vi.resetModules();
    const abortedUploadIds: string[] = [];
    const fakeClient = {
      send: vi.fn(async (command: unknown) => {
        if (command instanceof ListObjectsV2Command) {
          return { Contents: [], IsTruncated: false }; // nothing actually uploaded in this test
        }
        if (command instanceof DeleteObjectsCommand) {
          return {};
        }
        if (command instanceof AbortMultipartUploadCommand) {
          abortedUploadIds.push(command.input.UploadId!);
          return {};
        }
        throw new Error(`Unexpected command: ${command?.constructor.name}`);
      }),
    };
    vi.doMock("../../lib/storage.js", () => ({
      getStorageClient: () => fakeClient,
      getStorageConfig: () => ({ bucket: "fake-bucket" }),
    }));
    vi.doMock("../../lib/db.js", () => ({ getDb: () => db }));

    const { runRetentionSweep } = await import("../retention.js");
    const result = await runRetentionSweep();

    expect(result.expiredCount).toBe(1);
    expect(result.abandonedCount).toBe(1);
    expect(abortedUploadIds).toEqual(["abandoned-upload-id"]);

    expect(await getRecordingById(db.orm, overdueRecordingId)).toBeNull();
    expect(await getRecordingById(db.orm, abandonedRecordingId)).toBeNull();
    expect(await getRecordingById(db.orm, keptRecordingId)).not.toBeNull();

    vi.doUnmock("../../lib/storage.js");
    vi.doUnmock("../../lib/db.js");
  });
});

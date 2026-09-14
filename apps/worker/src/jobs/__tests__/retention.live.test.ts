import { createDb, getRecordingById, runMigrations } from "@recordmint/db";
import { generateId, generatePublicId } from "@recordmint/shared";
import { getObjectStream, originalKey, posterKey, putObject } from "@recordmint/storage";
import { eq } from "drizzle-orm";
import * as schema from "@recordmint/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getStorageClient, getStorageConfig } from "../../lib/storage.js";
import { runRetentionSweep } from "../retention.js";

/**
 * `retention.test.ts` fakes every S3 call and always returns an empty
 * listing ("nothing actually uploaded in this test") — so the sweep's
 * actual object deletion, the thing SPEC.md §20 names, had never been
 * proven against a real store. This runs the unmocked job against a real
 * S3-compatible endpoint: two real objects (an overdue recording's
 * original and poster) are written for real, one recording that should
 * survive keeps its object, and the assertion is a real `GetObject`
 * against the bucket afterward, not a spy on the deletion call.
 */
describe.skipIf(!process.env.S3_ENDPOINT || !process.env.DATABASE_URL)(
  "runRetentionSweep against live storage",
  () => {
    let db: ReturnType<typeof createDb>;
    const retainedWorkspaceId = generateId();
    const foreverWorkspaceId = generateId();
    const userId = generateId();
    const overdueRecordingId = generateId();
    const keptRecordingId = generateId();

    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

    beforeAll(async () => {
      db = createDb({ connectionString: process.env.DATABASE_URL! });
      await runMigrations();

      await db.orm.insert(schema.workspaces).values([
        { id: retainedWorkspaceId, name: "Retained live", slug: `retained-live-${retainedWorkspaceId}`, retentionDays: 1 },
        { id: foreverWorkspaceId, name: "Forever live", slug: `forever-live-${foreverWorkspaceId}` },
      ]);
      await db.orm.insert(schema.users).values({ id: userId, email: `u-${userId}@example.test`, passwordHash: "x", name: "U" });

      const overdueObjectKey = originalKey(overdueRecordingId, "mp4");
      const overduePosterKey = posterKey(overdueRecordingId);
      const keptObjectKey = originalKey(keptRecordingId, "mp4");

      const client = getStorageClient();
      const config = getStorageConfig();
      await putObject(client, config.bucket, overdueObjectKey, Buffer.from("overdue original"), "video/mp4");
      await putObject(client, config.bucket, overduePosterKey, Buffer.from("overdue poster"), "image/jpeg");
      await putObject(client, config.bucket, keptObjectKey, Buffer.from("kept forever"), "video/mp4");

      await db.orm.insert(schema.recordings).values([
        {
          id: overdueRecordingId,
          publicId: generatePublicId(),
          workspaceId: retainedWorkspaceId,
          creatorId: userId,
          title: "Overdue, live",
          objectKey: overdueObjectKey,
          posterKey: overduePosterKey,
          status: "ready",
          createdAt: twoDaysAgo,
        },
        {
          id: keptRecordingId,
          publicId: generatePublicId(),
          workspaceId: foreverWorkspaceId,
          creatorId: userId,
          title: "Kept forever, live",
          objectKey: keptObjectKey,
          status: "ready",
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

    it("really deletes the overdue recording's objects and leaves the retained-forever one untouched", async () => {
      const client = getStorageClient();
      const config = getStorageConfig();

      // Sanity: both objects are really there before the sweep.
      await expect(getObjectStream(client, config.bucket, originalKey(overdueRecordingId, "mp4"))).resolves.toBeTruthy();
      await expect(getObjectStream(client, config.bucket, posterKey(overdueRecordingId))).resolves.toBeTruthy();
      await expect(getObjectStream(client, config.bucket, originalKey(keptRecordingId, "mp4"))).resolves.toBeTruthy();

      const result = await runRetentionSweep();
      expect(result.expiredCount).toBeGreaterThanOrEqual(1);

      await expect(getObjectStream(client, config.bucket, originalKey(overdueRecordingId, "mp4"))).rejects.toThrow();
      await expect(getObjectStream(client, config.bucket, posterKey(overdueRecordingId))).rejects.toThrow();

      // The retained-forever recording's object must survive the same sweep.
      await expect(getObjectStream(client, config.bucket, originalKey(keptRecordingId, "mp4"))).resolves.toBeTruthy();

      expect(await getRecordingById(db.orm, overdueRecordingId)).toBeNull();
      expect(await getRecordingById(db.orm, keptRecordingId)).not.toBeNull();
    }, 30_000);
  },
);

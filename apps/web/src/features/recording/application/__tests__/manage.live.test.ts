import { generateId, generatePublicId } from "@recordmint/shared";
import { upsertTranscript } from "@recordmint/db";
import { originalKey, posterKey, transcriptKey, putObject, getObjectStream } from "@recordmint/storage";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getDb } from "../../../../lib/db.js";
import { getStorageClient, getStorageConfig } from "../../../../lib/storage.js";
import { deleteRecording } from "../manage.js";

/**
 * `manage.test.ts` only ever proved delete's permission rule — every prior
 * assertion on `deleteRecording` expected `INSUFFICIENT_ROLE`, so the
 * function's actual success path (deleting the real objects behind a
 * recording, per SPEC.md §6) had never run against any storage backend,
 * faked or real. This is that missing coverage, against a real
 * S3-compatible endpoint: three real objects (original, poster,
 * transcript) are written under one recording's prefix, `deleteRecording`
 * is called as its creator, and every object plus the row itself is
 * confirmed gone by listing the bucket directly — not by trusting the
 * call returned without throwing.
 */
describe.skipIf(!process.env.S3_ENDPOINT || !process.env.DATABASE_URL)(
  "deleteRecording against live storage",
  () => {
    const workspaceId = generateId();
    const creatorUserId = generateId();

    beforeAll(async () => {
      const db = getDb();
      await db.sql`INSERT INTO workspaces (id, name, slug) VALUES (${workspaceId}, 'Live delete', ${"w-" + workspaceId})`;
      await db.sql`INSERT INTO users (id, email, password_hash, name) VALUES (${creatorUserId}, ${creatorUserId + "@example.test"}, 'x', 'Creator')`;
      await db.sql`INSERT INTO memberships (id, workspace_id, user_id, role) VALUES (${generateId()}, ${workspaceId}, ${creatorUserId}, 'member')`;
    });

    afterAll(async () => {
      const db = getDb();
      await db.sql`DELETE FROM workspaces WHERE id = ${workspaceId}`;
      await db.sql`DELETE FROM users WHERE id = ${creatorUserId}`;
      await db.sql.end();
    });

    it("deletes every real object behind a recording — original, poster and transcript — and the row itself", async () => {
      const recordingId = generateId();
      const client = getStorageClient();
      const config = getStorageConfig();
      const db = getDb();

      const objectKey = originalKey(recordingId, "mp4");
      const posterObjectKey = posterKey(recordingId);
      const transcriptObjectKey = transcriptKey(recordingId);

      await putObject(client, config.bucket, objectKey, Buffer.from("fake original bytes"), "video/mp4");
      await putObject(client, config.bucket, posterObjectKey, Buffer.from("fake poster bytes"), "image/jpeg");
      await putObject(client, config.bucket, transcriptObjectKey, Buffer.from("WEBVTT\n\n"), "text/vtt");

      await db.sql`
        INSERT INTO recordings (id, public_id, workspace_id, creator_id, title, status, object_key, poster_key)
        VALUES (${recordingId}, ${generatePublicId()}, ${workspaceId}, ${creatorUserId}, 'Delete me for real', 'ready', ${objectKey}, ${posterObjectKey})
      `;
      await upsertTranscript(db.orm, {
        id: generateId(),
        recordingId,
        status: "ready",
        objectKey: transcriptObjectKey,
        text: "hello",
      });

      // Sanity: all three objects are really there before deletion, so the
      // post-delete rejections below prove something, not nothing.
      for (const key of [objectKey, posterObjectKey, transcriptObjectKey]) {
        await expect(getObjectStream(client, config.bucket, key)).resolves.toBeTruthy();
      }

      const result = await deleteRecording({ recordingId, userId: creatorUserId, membershipRole: "member" });
      expect(result.deletedObjectCount).toBe(3);

      for (const key of [objectKey, posterObjectKey, transcriptObjectKey]) {
        await expect(getObjectStream(client, config.bucket, key)).rejects.toThrow();
      }

      const rows = await db.sql`SELECT id FROM recordings WHERE id = ${recordingId}`;
      expect(rows.length).toBe(0);
    }, 30_000);
  },
);
